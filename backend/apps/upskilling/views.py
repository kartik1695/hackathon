import logging
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.permissions import IsAuthenticated

from core.permissions import IsEmployee, IsManager
from .models import SkillRoadmap, RoadmapStep
from .serializers import SkillRoadmapSerializer, SkillRoadmapListSerializer, RoadmapStepSerializer

logger = logging.getLogger("hrms")


def _get_employee(user):
    try:
        return user.employee
    except Exception:
        return None


class RoadmapListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)
        roadmaps = SkillRoadmap.objects.filter(employee=emp).prefetch_related("steps").order_by("-created_at")
        return Response(SkillRoadmapListSerializer(roadmaps, many=True).data)

    def post(self, request):
        """Trigger AI roadmap generation via MCP tool layer."""
        skill_name = request.data.get("skill_name", "").strip()
        if not skill_name:
            return Response({"error": "skill_name required", "code": "MISSING_FIELD"}, status=400)

        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import generate_skill_roadmap
        result = generate_skill_roadmap(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"skill_name": skill_name},
        )
        if "error" in result:
            return Response(result, status=400)

        try:
            roadmap = SkillRoadmap.objects.prefetch_related("steps").get(id=result["id"])
            return Response(SkillRoadmapSerializer(roadmap).data, status=201)
        except SkillRoadmap.DoesNotExist:
            return Response(result, status=201)


class RoadmapDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def _get_roadmap(self, pk, emp):
        try:
            roadmap = SkillRoadmap.objects.prefetch_related("steps").get(pk=pk)
        except SkillRoadmap.DoesNotExist:
            return None, Response({"error": "Not found"}, status=404)

        role = emp.role
        if role in ("admin", "hr"):
            return roadmap, None
        if roadmap.employee_id == emp.id:
            return roadmap, None
        if role == "manager" and roadmap.employee.manager_id == emp.id:
            return roadmap, None

        return None, Response({"error": "Forbidden"}, status=403)

    def get(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)
        roadmap, err = self._get_roadmap(pk, emp)
        if err:
            return err
        return Response(SkillRoadmapSerializer(roadmap).data)


class RoadmapApproveView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import approve_roadmap
        result = approve_roadmap(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"roadmap_id": pk},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class RoadmapRejectView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        feedback = request.data.get("feedback", "").strip()
        if not feedback:
            return Response({"error": "feedback required", "code": "MISSING_FIELD"}, status=400)

        from mcp.tools.upskilling_tools import reject_roadmap
        result = reject_roadmap(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"roadmap_id": pk, "feedback": feedback},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class PendingRoadmapApprovalsView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        roadmaps = SkillRoadmap.objects.filter(
            employee__manager=emp,
            status="PENDING_APPROVAL",
        ).select_related("employee__user").prefetch_related("steps").order_by("-created_at")

        return Response(SkillRoadmapListSerializer(roadmaps, many=True).data)


class StepSubmitView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import submit_roadmap_step
        result = submit_roadmap_step(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={
                "step_id": pk,
                "notes": request.data.get("notes", ""),
                "url": request.data.get("url", ""),
            },
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class StepApproveView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import approve_roadmap_step
        result = approve_roadmap_step(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"step_id": pk, "feedback": request.data.get("feedback", "Excellent work!")},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class StepRejectView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        feedback = request.data.get("feedback", "").strip()
        if not feedback:
            return Response({"error": "feedback required", "code": "MISSING_FIELD"}, status=400)

        from mcp.tools.upskilling_tools import reject_roadmap_step
        result = reject_roadmap_step(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"step_id": pk, "feedback": feedback},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class TeamRoadmapsView(APIView):
    """Manager: view all roadmaps for direct reports."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        status_filter = request.query_params.get("status")
        qs = SkillRoadmap.objects.filter(
            employee__manager=emp,
        ).select_related("employee__user").prefetch_related("steps").order_by("-created_at")

        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        return Response(SkillRoadmapListSerializer(qs, many=True).data)
