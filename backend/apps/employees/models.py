from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        if not email:
            raise ValueError("email is required")
        if not extra_fields.get("name"):
            raise ValueError("name is required")
        if not extra_fields.get("phone_number"):
            raise ValueError("phone_number is required")

        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        if not extra_fields.get("name"):
            raise ValueError("name is required")
        if not extra_fields.get("phone_number"):
            raise ValueError("phone_number is required")
        return self.create_user(email=email, password=password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=32, unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name", "phone_number"]

    objects = UserManager()

    def get_full_name(self) -> str:
        return self.name

    def __str__(self) -> str:
        return f"{self.name} <{self.email}>"


class Department(models.Model):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=20, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class Employee(models.Model):
    ROLE_EMPLOYEE = "employee"
    ROLE_MANAGER = "manager"
    ROLE_HR = "hr"
    ROLE_CFO = "cfo"
    ROLE_ADMIN = "admin"

    ROLE_CHOICES = (
        (ROLE_EMPLOYEE, "Employee"),
        (ROLE_MANAGER, "Manager"),
        (ROLE_HR, "HR"),
        (ROLE_CFO, "CFO"),
        (ROLE_ADMIN, "Admin"),
    )

    objects = models.Manager()

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="employee")
    employee_id = models.CharField(max_length=32, unique=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_EMPLOYEE)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees")
    manager = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="direct_reports"
    )
    title = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    joined_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["employee_id"]

    def __str__(self) -> str:
        return f"{self.employee_id} - {self.user.get_full_name() or self.user.email}"
