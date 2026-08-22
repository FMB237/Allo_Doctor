from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.auth_utils import get_current_user, require_admin
from app import models

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request, 
        name="index.html", 
        context={"message": "Allo Doctor: Classic Mode Active! 🩺"}
    )

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html")

@router.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse(request=request, name="register.html")

@router.get("/register/success", response_class=HTMLResponse)
async def register_success(request: Request):
    return templates.TemplateResponse(request=request, name="register_success.html")

@router.get("/patient/dashboard", response_class=HTMLResponse)
async def patient_dashboard(request: Request):
    return templates.TemplateResponse(request=request, name="patient_dashboard.html")

@router.get("/doctor/dashboard", response_class=HTMLResponse)
async def doctor_dashboard(request: Request):
    return templates.TemplateResponse(request=request, name="doctor_dashboard.html", context={})

@router.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(request: Request, admin_user: models.User = Depends(require_admin)):
    return templates.TemplateResponse(request=request, name="admin_dashboard.html", context={"user": admin_user})

@router.get("/forgot-password", response_class=HTMLResponse)
async def forgot_password_page(request: Request):
    return templates.TemplateResponse(request=request, name="email_verification.html")

@router.get("/reset-password", response_class=HTMLResponse)
async def reset_password_page(request: Request):
    return templates.TemplateResponse(request=request, name="password_reset.html")
