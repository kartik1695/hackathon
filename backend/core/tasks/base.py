import logging

from celery import Task

logger = logging.getLogger("hrms")


class BaseHRMSTask(Task):
    abstract = True
    max_retries = 3
    default_retry_delay = 60

    def run(self, *args, **kwargs):
        task_name = self.__class__.__name__
        logger.info("[TASK START] %s | args=%s kwargs=%s", task_name, args, kwargs)
        try:
            result = self.execute(*args, **kwargs)
            logger.info("[TASK DONE] %s", task_name)
            return result
        except Exception as exc:
            retries = self.request.retries
            if retries >= self.max_retries:
                logger.error(
                    "[TASK MAX_RETRIES] %s | retries=%s error=%s — giving up",
                    task_name,
                    retries,
                    exc,
                )
                raise
            # Exponential backoff: 60s, 120s, 240s
            countdown = self.default_retry_delay * (2 ** retries)
            logger.warning(
                "[TASK RETRY] %s | attempt=%s/%s countdown=%ss error=%s",
                task_name,
                retries + 1,
                self.max_retries,
                countdown,
                exc,
            )
            raise self.retry(exc=exc, countdown=countdown)

    def execute(self, *args, **kwargs):
        raise NotImplementedError("Subclasses must implement execute()")
