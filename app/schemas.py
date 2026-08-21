from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str = "patient"
    specialization: str | None = None

class DoctorProfileUpdate(BaseModel):
    specialization: str | None = None
    bio: str | None = None
    experience_years: int | None = None
    consultation_fee: int | None = None

class AppointmentCreate(BaseModel):
    doctor_id: int
    appointment_time: datetime

class AppointmentStatusUpdate(BaseModel):
    status: str  # e.g., "confirmed", "completed", "cancelled"

# Optional: Response schemas for cleaner API responses
class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: str

    model_config = ConfigDict(from_attributes=True)

class DoctorProfileResponse(BaseModel):
    id: int
    specialization: str
    bio: str | None = None
    experience_years: int | None = None
    consultation_fee: int | None = None

    model_config = ConfigDict(from_attributes=True)
