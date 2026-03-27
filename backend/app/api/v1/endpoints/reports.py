from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm import aliased
from sqlalchemy import or_
from app.api import deps
from app.models.all import MessageReport, Message, ServerMembership, MemberRole, User, ReportStatus
from app.schemas.all import ReportCreate, ReportSchema, ReportUpdate, MyReportsResponse
from app.core.socket_manager import manager


router = APIRouter()


async def notify_report_changed(server_id: str, report_id: str, status_value: str) -> None:
    await manager.broadcast_to_server(
        server_id,
        "report_changed",
        {
            "server_id": server_id,
            "report_id": report_id,
            "status": status_value,
        },
    )


def build_report_schema(
    report: MessageReport,
    message: Message,
    reporter: Optional[User],
    reported: Optional[User],
) -> ReportSchema:
    return ReportSchema(
        id=report.id,
        server_id=report.server_id,
        message_id=report.message_id,
        created_at=report.created_at,
        reporter_id=report.reporter_id,
        status=report.status,
        reason=report.reason,
        resolution_note=report.resolution_note,
        message_content=message.content,
        reporter=reporter,
        reported_user=reported,
    )

@router.post("/messages/{message_id}/report", response_model=ReportSchema)
def create_report(
    *,
    db: Session = Depends(deps.get_db),
    message_id: str,
    report_in: ReportCreate,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Mesajı raporla.
    """
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı.")
        
    # Zaten raporlamış mı? uq_report_once
    existing_report = db.query(MessageReport).filter(
        MessageReport.message_id == message_id,
        MessageReport.reporter_id == current_user.id
    ).first()
    
    if existing_report:
        raise HTTPException(status_code=409, detail="Bu mesajı zaten raporladınız.")
        
    report = MessageReport(
        server_id=message.server_id,
        message_id=message_id,
        reporter_id=current_user.id,
        reason=report_in.reason
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    background_tasks.add_task(
        notify_report_changed,
        str(report.server_id),
        str(report.id),
        str(report.status),
    )
    reporter = db.query(User).filter(User.id == report.reporter_id).first()
    reported = db.query(User).filter(User.id == message.author_id).first()
    return build_report_schema(report, message, reporter, reported)

@router.get("/servers/{server_id}/reports", response_model=List[ReportSchema])
def read_reports(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    status_filter: ReportStatus | None = None,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Raporları listele. Sadece Mod/Admin.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member or member.role == MemberRole.member:
        raise HTTPException(status_code=403, detail="Erişim yetkiniz yok.")
        
    reporter_user = aliased(User)
    reported_user = aliased(User)

    query = (
        db.query(MessageReport, Message, reporter_user, reported_user)
        .join(Message, Message.id == MessageReport.message_id)
        .outerjoin(reporter_user, reporter_user.id == MessageReport.reporter_id)
        .join(reported_user, reported_user.id == Message.author_id)
        .filter(MessageReport.server_id == server_id)
    )
    if status_filter:
        query = query.filter(MessageReport.status == status_filter)

    rows = query.order_by(MessageReport.created_at.desc()).all()

    return [build_report_schema(report, message, reporter, reported) for report, message, reporter, reported in rows]


@router.get("/servers/{server_id}/reports/system", response_model=List[ReportSchema])
def read_system_reports(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sadece sistem bildirimi raporlarını listele. Tum uyeler gorebilir.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id,
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Erişim yetkiniz yok.")

    if member.is_banned:
        reason = (
            f"Bu sunucudan banlandınız. Sebep: {member.banned_reason}"
            if member.banned_reason
            else "Bu sunucudan banlandınız."
        )
        raise HTTPException(status_code=403, detail=reason)

    reporter_user = aliased(User)
    reported_user = aliased(User)

    rows = (
        db.query(MessageReport, Message, reporter_user, reported_user)
        .join(Message, Message.id == MessageReport.message_id)
        .outerjoin(reporter_user, reporter_user.id == MessageReport.reporter_id)
        .outerjoin(reported_user, reported_user.id == Message.author_id)
        .filter(MessageReport.server_id == server_id)
        .filter(MessageReport.reason == "Sistem bildirimi")
        .order_by(MessageReport.created_at.desc())
        .all()
    )

    return [
        build_report_schema(report, message, reporter, reported)
        for report, message, reporter, reported in rows
    ]


@router.get("/reports/my", response_model=MyReportsResponse)
def read_my_reports(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kullanıcının şikayet ettikleri ve hakkında açılan şikayetler.
    """
    reporter_user = aliased(User)
    reported_user = aliased(User)

    submitted_rows = (
        db.query(MessageReport, Message, reporter_user, reported_user)
        .join(Message, Message.id == MessageReport.message_id)
        .join(reporter_user, reporter_user.id == MessageReport.reporter_id)
        .join(reported_user, reported_user.id == Message.author_id)
        .filter(MessageReport.reporter_id == current_user.id)
        .filter(or_(MessageReport.reason.is_(None), MessageReport.reason != "Sistem bildirimi"))
        .order_by(MessageReport.created_at.desc())
        .all()
    )

    received_rows = (
        db.query(MessageReport, Message, reporter_user, reported_user)
        .join(Message, Message.id == MessageReport.message_id)
        .join(reporter_user, reporter_user.id == MessageReport.reporter_id)
        .join(reported_user, reported_user.id == Message.author_id)
        .filter(Message.author_id == current_user.id)
        .filter(or_(MessageReport.reason.is_(None), MessageReport.reason != "Sistem bildirimi"))
        .order_by(MessageReport.created_at.desc())
        .all()
    )

    submitted = [build_report_schema(report, message, reporter, reported) for report, message, reporter, reported in submitted_rows]
    received = [build_report_schema(report, message, reporter, reported) for report, message, reporter, reported in received_rows]

    return MyReportsResponse(submitted=submitted, received=received)

@router.patch("/reports/{report_id}", response_model=ReportSchema)
def resolve_report(
    *,
    db: Session = Depends(deps.get_db),
    report_id: str,
    report_in: ReportUpdate,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Rapor durumunu güncelle.
    """
    report = db.query(MessageReport).filter(MessageReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Rapor bulunamadı.")
        
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == report.server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member or member.role == MemberRole.member:
        raise HTTPException(status_code=403, detail="Yetkisiz işlem.")
        
    if report_in.status not in [ReportStatus.reviewing, ReportStatus.resolved, ReportStatus.rejected]:
        raise HTTPException(status_code=400, detail="Geçersiz rapor durumu.")

    report.status = report_in.status
    report.reviewed_by = current_user.id
    if report_in.resolution_note:
        report.resolution_note = report_in.resolution_note
        
    db.add(report)
    db.commit()
    db.refresh(report)
    background_tasks.add_task(
        notify_report_changed,
        str(report.server_id),
        str(report.id),
        str(report.status),
    )

    message = db.query(Message).filter(Message.id == report.message_id).first()
    reporter = db.query(User).filter(User.id == report.reporter_id).first()
    reported = db.query(User).filter(User.id == message.author_id).first() if message else None
    if not message or not reporter or not reported:
        return report
    return build_report_schema(report, message, reporter, reported)


@router.delete("/reports/{report_id}/my", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_report(
    *,
    db: Session = Depends(deps.get_db),
    report_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """
    Kullanici kendi rapor kaydini silebilir (gonderdigi veya hakkinda olan).
    """
    report = db.query(MessageReport).filter(MessageReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Rapor bulunamadi.")

    message = db.query(Message).filter(Message.id == report.message_id).first()
    is_reporter = str(report.reporter_id) == str(current_user.id)
    is_reported_user = message and str(message.author_id) == str(current_user.id)

    if not is_reporter and not is_reported_user:
        raise HTTPException(status_code=403, detail="Bu raporu silemezsiniz.")

    db.delete(report)
    db.commit()
    return None
