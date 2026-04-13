from rest_framework import serializers


class PolicyIngestSerializer(serializers.Serializer):
    document_name = serializers.SlugField(max_length=120)
    document_title = serializers.CharField(max_length=200, required=False, allow_blank=True)
    chunk_strategy = serializers.ChoiceField(choices=("simple", "metadata", "schema"), default="simple")
    version = serializers.CharField(max_length=64, required=False, allow_blank=True)
    activate = serializers.BooleanField(required=False, default=True)
    file = serializers.FileField()

