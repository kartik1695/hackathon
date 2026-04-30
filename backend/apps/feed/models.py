from django.db import models


class FeedPost(models.Model):
    author = models.ForeignKey(
        "employees.Employee", on_delete=models.CASCADE, related_name="feed_posts"
    )
    text = models.TextField(blank=True, default="")
    kudos_to = models.ForeignKey(
        "employees.Employee",
        on_delete=models.SET_NULL,
        related_name="kudos_received",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"], name="feed_post_created_idx"),
        ]

    def __str__(self) -> str:
        return f"Post {self.pk} by {self.author_id}"


class FeedPostImage(models.Model):
    post = models.ForeignKey(
        FeedPost, on_delete=models.CASCADE, related_name="images"
    )
    image = models.ImageField(upload_to="feed/", blank=True, null=True)
    image_url = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["post", "-created_at"], name="feed_img_post_created_idx"),
        ]

    def __str__(self) -> str:
        return f"PostImage {self.pk} post={self.post_id}"


class FeedPostLike(models.Model):
    post = models.ForeignKey(
        FeedPost, on_delete=models.CASCADE, related_name="likes"
    )
    employee = models.ForeignKey(
        "employees.Employee", on_delete=models.CASCADE, related_name="feed_likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["post", "employee"],
                name="uniq_feed_like_post_employee",
            )
        ]
        indexes = [
            models.Index(fields=["post", "-created_at"], name="feed_like_post_created_idx"),
            models.Index(fields=["employee", "-created_at"], name="feed_like_emp_created_idx"),
        ]

    def __str__(self) -> str:
        return f"Like {self.pk} post={self.post_id} emp={self.employee_id}"


class FeedComment(models.Model):
    post = models.ForeignKey(
        FeedPost, on_delete=models.CASCADE, related_name="comments"
    )
    author = models.ForeignKey(
        "employees.Employee", on_delete=models.CASCADE, related_name="feed_comments"
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["post", "created_at"], name="feed_comment_post_created_idx"),
        ]

    def __str__(self) -> str:
        return f"Comment {self.pk} post={self.post_id}"

