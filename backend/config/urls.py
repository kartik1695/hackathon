from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/auth/", include("apps.employees.auth_urls")),
    path("api/employees/", include("apps.employees.urls")),
    path("api/attendance/", include("apps.attendance.urls")),
    path("api/leaves/", include("apps.leaves.urls")),
    path("api/payroll/", include("apps.payroll.urls")),
    path("api/performance/", include("apps.performance.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/ai/", include("apps.ai.urls")),
    path("api/rag/", include("apps.rag.urls")),
]

if settings.DEBUG:
    try:
        import debug_toolbar
    except ImportError:
        debug_toolbar = None
    if debug_toolbar:
        urlpatterns = [path("__debug__/", include("debug_toolbar.urls"))] + urlpatterns
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
