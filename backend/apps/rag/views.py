import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsHR
from core.utils import error_response
from tasks.rag_policy_tasks import policy_ingest
from .serializers import PolicyIngestSerializer

logger = logging.getLogger("hrms")


class PolicyIngestView(APIView):
    permission_classes = [IsHR]
    serializer_class = PolicyIngestSerializer

    def post(self, request):
        serializer = PolicyIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        document_name = data["document_name"]
        document_title = data.get("document_title") or document_name
        chunk_strategy = data.get("chunk_strategy") or "simple"
        version = data.get("version") or None
        activate = bool(data.get("activate", True))
        upload = data["file"]
        raw = upload.read()
        content = raw.decode("utf-8", errors="ignore")

        policy_ingest.delay(
            document_name=document_name,
            document_title=document_title,
            chunk_strategy=chunk_strategy,
            version=version,
            activate=activate,
            file_content=content,
            document_path=getattr(upload, "name", ""),
        )
        logger.info("Policy ingest queued name=%s file=%s strategy=%s version=%s", document_name, getattr(upload, "name", ""), chunk_strategy, version or "auto")
        return Response({"status": "queued", "document_name": document_name, "version": version, "chunk_strategy": chunk_strategy}, status=202)
