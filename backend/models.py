from sqlalchemy import Column, String, Float, DateTime
from database import Base

class Transaction(Base):
    __tablename__ = "transactions"

    transaction_id = Column(String, primary_key=True)
    sender_id = Column(String, index=True)
    receiver_id = Column(String, index=True)
    amount = Column(Float)
    timestamp = Column(DateTime)
