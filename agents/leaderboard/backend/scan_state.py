_state: dict = {
    "active": False,
    "current_name": None,
    "index": 0,
    "total": 0,
    "triggered_by": None,
}


def get() -> dict:
    return dict(_state)


def start(total: int, triggered_by: str) -> None:
    _state.update(active=True, total=total, index=0, current_name=None, triggered_by=triggered_by)


def update(name: str, index: int) -> None:
    _state.update(current_name=name, index=index)


def finish() -> None:
    _state.update(active=False, current_name=None, index=0, total=0, triggered_by=None)
