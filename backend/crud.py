from sqlalchemy.orm import Session
from models import Transaction

def save_transactions(db: Session, records):
    for row in records:
        tx = Transaction(**row)
        db.add(tx)
    db.commit()

def clear_transactions(db: Session):
    db.query(Transaction).delete()
    db.commit()
