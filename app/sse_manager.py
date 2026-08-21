import asyncio
import json
from datetime import datetime

class SSEManager:
    """Manages Server-Sent Events connections. Each doctor gets their own channel."""
    
    def __init__(self):
        self._channels: dict[int, list[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, doctor_id: int) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            if doctor_id not in self._channels:
                self._channels[doctor_id] = []
            self._channels[doctor_id].append(queue)
        return queue

    async def unsubscribe(self, doctor_id: int, queue: asyncio.Queue):
        async with self._lock:
            if doctor_id in self._channels and queue in self._channels[doctor_id]:
                self._channels[doctor_id].remove(queue)
                if not self._channels[doctor_id]:
                    del self._channels[doctor_id]

    async def broadcast(self, doctor_id: int, event_type: str, data: dict):
        message = {"type": event_type, "data": data, "timestamp": datetime.now().isoformat()}
        payload = f"data: {json.dumps(message)}\n\n"
        async with self._lock:
            queues = self._channels.get(doctor_id, []).copy()
            for queue in queues:
                try:
                    queue.put_nowait(payload)
                except asyncio.QueueFull:
                    pass  # Client is too slow, drop the message

# Global instance
sse_manager = SSEManager()
