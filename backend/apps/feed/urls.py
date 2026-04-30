from django.urls import path

from .views import FeedCommentListCreateView, FeedPostLikeToggleView, FeedPostListCreateView

urlpatterns = [
    path("posts/", FeedPostListCreateView.as_view(), name="feed-posts"),
    path("posts/<int:post_id>/like/", FeedPostLikeToggleView.as_view(), name="feed-post-like"),
    path("posts/<int:post_id>/comments/", FeedCommentListCreateView.as_view(), name="feed-post-comments"),
]

