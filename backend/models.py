from sqlalchemy import Column, String, Float, Integer, DateTime
from database import Base
import datetime

class TransactionRecord(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String, index=True)
    sender_id = Column(String, index=True)
    receiver_id = Column(String, index=True)
    amount = Column(Float)
    timestamp = Column(String)

class FlaggedEntity(Base):
    __tablename__ = "flagged_entities"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String, unique=True, index=True)
    risk_score = Column(Integer)
    fraud_type = Column(String)
    country = Column(String)
    last_analyzed = Column(DateTime, default=datetime.datetime.utcnow)