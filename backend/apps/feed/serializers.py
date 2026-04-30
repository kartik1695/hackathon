from rest_framework import serializers

from .models import FeedComment, FeedPost, FeedPostImage


class FeedPostImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = FeedPostImage
        fields = ["id", "url"]

    def get_url(self, obj: FeedPostImage) -> str:
        request = self.context.get("request")
        if obj.image:
            try:
                return request.build_absolute_uri(obj.image.url) if request else obj.image.url
            except Exception:
                return obj.image.url
        return obj.image_url or ""


class FeedCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = FeedComment
        fields = ["id", "author_id", "author_name", "text", "created_at"]

    def get_author_name(self, obj: FeedComment) -> str:
        try:
            return obj.author.user.name or ""
        except Exception:
            return ""


class FeedPostSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    kudos_to_name = serializers.SerializerMethodField()
    images = FeedPostImageSerializer(many=True, read_only=True)
    like_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)
    liked_by_me = serializers.BooleanField(read_only=True)

    class Meta:
        model = FeedPost
        fields = [
            "id",
            "author_id",
            "author_name",
            "text",
            "kudos_to",
            "kudos_to_name",
            "created_at",
            "images",
            "like_count",
            "comment_count",
            "liked_by_me",
        ]

    def get_author_name(self, obj: FeedPost) -> str:
        try:
            return obj.author.user.name or ""
        except Exception:
            return ""

    def get_kudos_to_name(self, obj: FeedPost) -> str:
        if not obj.kudos_to_id:
            return ""
        try:
            return obj.kudos_to.user.name or ""
        except Exception:
            return ""

