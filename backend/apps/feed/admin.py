from django.contrib import admin

from .models import FeedComment, FeedPost, FeedPostImage, FeedPostLike


@admin.register(FeedPost)
class FeedPostAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "kudos_to", "created_at")
    search_fields = ("text",)
    list_select_related = ("author", "kudos_to")


@admin.register(FeedPostImage)
class FeedPostImageAdmin(admin.ModelAdmin):
    list_display = ("id", "post", "created_at")


@admin.register(FeedPostLike)
class FeedPostLikeAdmin(admin.ModelAdmin):
    list_display = ("id", "post", "employee", "created_at")
    list_select_related = ("post", "employee")


@admin.register(FeedComment)
class FeedCommentAdmin(admin.ModelAdmin):
    list_display = ("id", "post", "author", "created_at")
    search_fields = ("text",)
    list_select_related = ("post", "author")

