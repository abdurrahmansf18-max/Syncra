from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.api import deps
from app.models.all import Poll, PollOption, PollVote, ServerMembership, MemberRole, User, Channel
from app.schemas.all import PollCreate, PollSchema, VoteCreate, VoteResult
from app.core.socket_manager import manager

router = APIRouter()


def build_poll_schema(db: Session, poll: Poll, current_user_id: str) -> PollSchema:
    options = (
        db.query(PollOption)
        .filter(PollOption.poll_id == poll.id)
        .order_by(PollOption.position.asc())
        .all()
    )

    vote_rows = (
        db.query(PollVote.option_id, func.count(PollVote.id))
        .filter(PollVote.poll_id == poll.id)
        .group_by(PollVote.option_id)
        .all()
    )
    vote_map = {str(option_id): int(count) for option_id, count in vote_rows}
    total_votes = sum(vote_map.values())

    my_vote = (
        db.query(PollVote)
        .filter(PollVote.poll_id == poll.id, PollVote.voter_id == current_user_id)
        .first()
    )

    option_payloads = []
    for option in options:
        vote_count = vote_map.get(str(option.id), 0)
        vote_percent = (vote_count * 100 / total_votes) if total_votes > 0 else 0
        option_payloads.append(
            {
                "id": option.id,
                "poll_id": option.poll_id,
                "label": option.label,
                "position": option.position,
                "vote_count": vote_count,
                "vote_percent": round(vote_percent, 1),
            }
        )

    return PollSchema(
        id=poll.id,
        server_id=poll.server_id,
        channel_id=poll.channel_id,
        created_by=poll.created_by,
        question=poll.question,
        is_closed=poll.is_closed,
        closes_at=poll.closes_at,
        created_at=poll.created_at,
        total_votes=total_votes,
        my_vote_option_id=my_vote.option_id if my_vote else None,
        options=option_payloads,
    )

@router.post("/bot/poll", response_model=PollSchema)
def create_poll(
    *,
    db: Session = Depends(deps.get_db),
    poll_in: PollCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Anket oluştur (/poll). Mod+ yetkisi.
    """
    # Temel validasyon
    if not poll_in.question or not poll_in.question.strip():
        raise HTTPException(status_code=400, detail="Anket sorusu boş olamaz.")

    normalized_options = [opt.strip() for opt in poll_in.options if opt and opt.strip()]
    if len(normalized_options) < 2:
        raise HTTPException(status_code=400, detail="En az 2 geçerli seçenek gerekli.")
    if len(normalized_options) > 6:
        raise HTTPException(status_code=400, detail="En fazla 6 seçenek ekleyebilirsiniz.")

    # Yetki
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == poll_in.server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member or member.role == MemberRole.member or member.is_banned:
        raise HTTPException(status_code=403, detail="Anket oluşturma yetkiniz yok.")
        
    channel = db.query(Channel).filter(
        Channel.id == poll_in.channel_id,
        Channel.server_id == poll_in.server_id,
    ).first()

    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")

    poll = Poll(
        server_id=poll_in.server_id,
        channel_id=poll_in.channel_id,
        created_by=current_user.id,
        question=poll_in.question.strip()
    )
    db.add(poll)
    db.commit()
    db.refresh(poll) # ID gelsin
    
    # Seçenekleri ekle
    options = []
    for idx, opt_label in enumerate(normalized_options):
        opt = PollOption(
            poll_id=poll.id,
            label=opt_label,
            position=idx
        )
        db.add(opt)
        options.append(opt)
    
    db.commit()
    # refresh poll to get options
    db.refresh(poll)
    schema = build_poll_schema(db, poll, current_user.id)
    
    manager.broadcast(
        f"syncra:channel:{poll.channel_id}",
        "poll_created",
        schema.model_dump(
            mode="json",
            exclude={"is_voted"}
        )
    )

    return schema


@router.get("/channels/{channel_id}/polls", response_model=List[PollSchema])
def read_channel_polls(
    *,
    db: Session = Depends(deps.get_db),
    channel_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kanal anketlerini listele.
    """
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")

    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == channel.server_id,
        ServerMembership.user_id == current_user.id,
    ).first()
    if not member or member.is_banned:
        raise HTTPException(status_code=403, detail="Yetkiniz yok.")

    polls = (
        db.query(Poll)
        .filter(Poll.channel_id == channel_id)
        .order_by(Poll.created_at.desc())
        .all()
    )
    return [build_poll_schema(db, poll, current_user.id) for poll in polls]

@router.post("/polls/{poll_id}/vote", response_model=VoteResult)
def vote_poll(
    *,
    db: Session = Depends(deps.get_db),
    poll_id: str,
    vote_in: VoteCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Oy ver.
    """
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Anket bulunamadı.")
        
    if poll.is_closed:
        raise HTTPException(status_code=400, detail="Anket kapandı.")

    # Server üyesi mi?
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == poll.server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    if not member or member.is_banned:
        raise HTTPException(status_code=403, detail="Yetkiniz yok.")

    # Daha önce oy vermiş mi?
    existing_vote = db.query(PollVote).filter(
        PollVote.poll_id == poll_id,
        PollVote.voter_id == current_user.id
    ).first()
    
    if existing_vote:
        raise HTTPException(status_code=409, detail="Zaten oy kullandınız.")

    option = db.query(PollOption).filter(
        PollOption.id == vote_in.option_id,
        PollOption.poll_id == poll_id,
    ).first()
    if not option:
        raise HTTPException(status_code=400, detail="Geçersiz anket seçeneği.")

    vote = PollVote(
        poll_id=poll_id,
        option_id=vote_in.option_id,
        voter_id=current_user.id
    )
    db.add(vote)
    db.commit()
    db.refresh(vote)

    manager.broadcast(
        f"syncra:channel:{poll.channel_id}",
        "poll_voted",
        {"id": str(poll_id), "option_id": str(vote.option_id), "user_id": str(vote.voter_id)}
    )

    return vote
