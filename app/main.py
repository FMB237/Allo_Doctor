from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import engine, Base
from app.routers import pages, auth, doctors, appointments, sse, admin
from app.services.reminder_service import check_and_send_reminders

scheduler = AsyncIOScheduler()

async def run_reminders():
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await check_and_send_reminders(db)

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables created successfully!")
    
    # Start reminder scheduler
    scheduler.add_job(
        lambda: asyncio.create_task(run_reminders()),
        'interval',
        minutes=15,
        id='appointment_reminders'
    )
    scheduler.start()
    print("✅ Reminder scheduler started")
    
    yield
    scheduler.shutdown()
    await engine.dispose()

app = FastAPI(
    title="Allo_Doctor",
    description="Online medical consultation platform",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Include all routers
app.include_router(pages.router, tags=["Pages"])
app.include_router(auth.router, tags=["Authentication"])
app.include_router(doctors.router, tags=["Doctors"])
app.include_router(appointments.router, tags=["Appointments"])
app.include_router(sse.router, tags=["Real-time SSE"])
app.include_router(admin.router, tags=["Admin"])
