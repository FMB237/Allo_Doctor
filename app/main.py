from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import pages, auth, doctors, appointments, sse, admin

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables created successfully!")
    yield
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
