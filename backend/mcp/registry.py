import logging
from collections.abc import Callable

logger = logging.getLogger("hrms")

ToolFn = Callable[..., dict]
ResourceFn = Callable[..., dict]
PromptFn = Callable[..., str]

_TOOLS: dict[str, ToolFn] = {}
_RESOURCES: dict[str, ResourceFn] = {}
_PROMPTS: dict[str, PromptFn] = {}


def register(name: str, fn: ToolFn) -> None:
    _TOOLS[name] = fn
    logger.info("MCP tool registered name=%s", name)


def get(name: str) -> ToolFn | None:
    return _TOOLS.get(name)


def list_tools() -> list[str]:
    return sorted(_TOOLS.keys())


def register_tool(name: str, fn: ToolFn) -> None:
    _TOOLS[name] = fn
    logger.info("MCP tool registered name=%s", name)


def register_resource(name: str, fn: ResourceFn) -> None:
    _RESOURCES[name] = fn
    logger.info("MCP resource registered name=%s", name)


def register_prompt(name: str, fn: PromptFn) -> None:
    _PROMPTS[name] = fn
    logger.info("MCP prompt registered name=%s", name)


def get_tool(name: str) -> ToolFn | None:
    return _TOOLS.get(name)


def get_resource(name: str) -> ResourceFn | None:
    return _RESOURCES.get(name)


def get_prompt(name: str) -> PromptFn | None:
    return _PROMPTS.get(name)


def list_resources() -> list[str]:
    return sorted(_RESOURCES.keys())


def list_prompts() -> list[str]:
    return sorted(_PROMPTS.keys())


def tool(name: str | None = None):
    def decorator(fn: ToolFn) -> ToolFn:
        register_tool(name or fn.__name__, fn)
        return fn

    return decorator


def resource(name: str | None = None):
    def decorator(fn: ResourceFn) -> ResourceFn:
        register_resource(name or fn.__name__, fn)
        return fn

    return decorator


def prompt(name: str | None = None):
    def decorator(fn: PromptFn) -> PromptFn:
        register_prompt(name or fn.__name__, fn)
        return fn

    return decorator
