from rest_framework.views import APIView
from rest_framework.response import Response

from core.permissions import IsEmployee


class PayrollMeView(APIView):
    permission_classes = [IsEmployee]
    serializer_class = None

    def get(self, request):
        return Response([])
