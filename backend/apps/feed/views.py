import logging

from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, OuterRef
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from core.permissions import IsEmployee
from core.utils import error_response

from .models import FeedComment, FeedPost, FeedPostImage, FeedPostLike
from .serializers import FeedCommentSerializer, FeedPostSerializer

logger = logging.getLogger("hrms")


class FeedPostListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        try:
            page = request.query_params.get("page")
            page_size = request.query_params.get("page_size")
            if page is not None or page_size is not None:
                page = int(page or 1)
                limit = int(page_size or 20)
                page = max(1, page)
                offset = (page - 1) * limit
            else:
                limit = int(request.query_params.get("limit", 20))
                offset = int(request.query_params.get("offset", 0))
        except (TypeError, ValueError):
            return Response(error_response("Invalid limit/offset", "INVALID_INPUT"), status=400)
        limit = max(1, min(100, limit))
        offset = max(0, offset)

        me = getattr(request.user, "employee", None)
        if not me:
            return Response(error_response("Employee profile not found", "EMPLOYEE_NOT_FOUND"), status=404)

        like_exists = FeedPostLike.objects.filter(post=OuterRef("pk"), employee=me)
        qs = (
            FeedPost.objects.select_related("author__user", "kudos_to__user")
            .prefetch_related("images")
            .annotate(
                like_count=Count("likes", distinct=True),
                comment_count=Count("comments", distinct=True),
                liked_by_me=Exists(like_exists),
            )
            .order_by("-created_at")
        )

        total = qs.count()
        posts = list(qs[offset : offset + limit])
        return Response(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "page": (offset // limit) + 1,
                "page_size": limit,
                "results": FeedPostSerializer(posts, many=True, context={"request": request}).data,
            }
        )

    def post(self, request):
        me = getattr(request.user, "employee", None)
        if not me:
            return Response(error_response("Employee profile not found", "EMPLOYEE_NOT_FOUND"), status=404)

        text = (request.data.get("text") or "").strip()
        kudos_to = request.data.get("kudos_to")
        image = request.FILES.get("image")
        image_url = (request.data.get("image_url") or "").strip()

        if not text and not image and not image_url and not kudos_to:
            return Response(error_response("Post is empty", "EMPTY_POST"), status=400)

        kudos_emp = None
        if kudos_to:
            try:
                kudos_id = int(kudos_to)
            except (TypeError, ValueError):
                return Response(error_response("Invalid kudos_to", "INVALID_INPUT"), status=400)
            from apps.employees.models import Employee

            kudos_emp = Employee.objects.filter(pk=kudos_id, is_active=True).select_related("user").first()
            if not kudos_emp:
                return Response(error_response("kudos_to employee not found", "NOT_FOUND"), status=404)

        with transaction.atomic():
            post = FeedPost.objects.create(author=me, text=text, kudos_to=kudos_emp)
            if image or image_url:
                FeedPostImage.objects.create(post=post, image=image, image_url=image_url)

        logger.info("feed_post_created post_id=%s author_id=%s", post.id, me.id)

        if post.kudos_to_id and post.kudos_to_id != me.id:
            try:
                from apps.notifications.services import InAppNotificationService

                InAppNotificationService().create_notification(
                    recipient_email=post.kudos_to.user.email,
                    subject="🎉 You received kudos",
                    body=f"{me.user.name} gave you kudos on the Feed.",
                    metadata={"type": "feed_kudos", "post_id": post.id},
                    requester_email=me.user.email,
                )
            except Exception:
                logger.exception("feed_kudos_notification_failed post_id=%s", post.id)

        post_qs = (
            FeedPost.objects.filter(pk=post.pk)
            .select_related("author__user", "kudos_to__user")
            .prefetch_related("images")
            .annotate(
                like_count=Count("likes", distinct=True),
                comment_count=Count("comments", distinct=True),
                liked_by_me=Exists(FeedPostLike.objects.filter(post=OuterRef("pk"), employee=me)),
            )
        )
        post = post_qs.first() or post
        return Response(FeedPostSerializer(post, context={"request": request}).data, status=201)


class FeedPostLikeToggleView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def post(self, request, post_id: int):
        me = getattr(request.user, "employee", None)
        if not me:
            return Response(error_response("Employee profile not found", "EMPLOYEE_NOT_FOUND"), status=404)

        post = FeedPost.objects.select_related("author__user").filter(pk=post_id).first()
        if not post:
            return Response(error_response("Post not found", "NOT_FOUND"), status=404)

        liked = False
        with transaction.atomic():
            try:
                FeedPostLike.objects.create(post=post, employee=me)
                liked = True
            except IntegrityError:
                FeedPostLike.objects.filter(post=post, employee=me).delete()
                liked = False

        logger.info("feed_post_like_toggle post_id=%s employee_id=%s liked=%s", post.id, me.id, liked)

        if liked and post.author_id != me.id:
            try:
                from apps.notifications.services import InAppNotificationService

                InAppNotificationService().create_notification(
                    recipient_email=post.author.user.email,
                    subject="❤️ New like on your post",
                    body=f"{me.user.name} liked your Feed post.",
                    metadata={"type": "feed_like", "post_id": post.id},
                    requester_email=me.user.email,
                )
            except Exception:
                logger.exception("feed_like_notification_failed post_id=%s", post.id)

        like_count = FeedPostLike.objects.filter(post=post).count()
        return Response({"liked": liked, "like_count": like_count})


class FeedCommentListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def get(self, request, post_id: int):
        post = FeedPost.objects.filter(pk=post_id).first()
        if not post:
            return Response(error_response("Post not found", "NOT_FOUND"), status=404)

        qs = (
            FeedComment.objects.filter(post=post)
            .select_related("author__user")
            .order_by("created_at")
        )
        return Response({"results": FeedCommentSerializer(qs, many=True).data})

    def post(self, request, post_id: int):
        me = getattr(request.user, "employee", None)
        if not me:
            return Response(error_response("Employee profile not found", "EMPLOYEE_NOT_FOUND"), status=404)

        post = FeedPost.objects.select_related("author__user").filter(pk=post_id).first()
        if not post:
            return Response(error_response("Post not found", "NOT_FOUND"), status=404)

        text = (request.data.get("text") or "").strip()
        if len(text) < 1:
            return Response(error_response("Comment is empty", "EMPTY_COMMENT"), status=400)
        if len(text) > 2000:
            return Response(error_response("Comment too long", "TOO_LONG"), status=400)

        comment = FeedComment.objects.create(post=post, author=me, text=text)
        logger.info("feed_comment_created comment_id=%s post_id=%s author_id=%s", comment.id, post.id, me.id)

        if post.author_id != me.id:
            try:
                from apps.notifications.services import InAppNotificationService

                InAppNotificationService().create_notification(
                    recipient_email=post.author.user.email,
                    subject="💬 New comment on your post",
                    body=f"{me.user.name} commented on your Feed post.",
                    metadata={"type": "feed_comment", "post_id": post.id, "comment_id": comment.id},
                    requester_email=me.user.email,
                )
            except Exception:
                logger.exception("feed_comment_notification_failed post_id=%s", post.id)

        return Response(FeedCommentSerializer(comment).data, status=201)

