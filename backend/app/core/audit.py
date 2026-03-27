from sqlalchemy.orm import Session
from app.models.all import AuditLog, AuditAction
from typing import Optional, Dict
import uuid

def create_audit_log(
    db: Session,
    server_id: uuid.UUID,
    actor_id: Optional[uuid.UUID],
    action: AuditAction,
    target_user_id: Optional[uuid.UUID] = None,
    target_message_id: Optional[uuid.UUID] = None,
    reason: Optional[str] = None,
    metadata: Dict = {}
):
    log = AuditLog(
        server_id=server_id,
        actor_id=actor_id,
        target_user_id=target_user_id,
        target_message_id=target_message_id,
        action=action,
        reason=reason,
        metadata_=metadata # modelde metadata_ olarak tanımladım keywords çakışmasın diye
    )
    db.add(log)
    db.commit()
