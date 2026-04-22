from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsEmployee

from .serializers import AttendanceCheckInSerializer, AttendanceLogSerializer
from .services import AttendanceService


class AttendanceCheckInView(APIView):
    permission_classes = [IsEmployee]
    serializer_class = AttendanceCheckInSerializer

    def post(self, request):
        serializer = AttendanceCheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = request.user.employee
        log = AttendanceService(employee).check_in(serializer.validated_data["date"], serializer.validated_data["status"])
        return Response(AttendanceLogSerializer(log).data)
