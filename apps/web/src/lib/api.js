const API_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function fetchCategories() {
  return request('/api/rooms/categories');
}

export function createRoom(categories = []) {
  return request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ categories }),
  });
}

export function joinRoom(code, clientId) {
  return request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  });
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append('avatar', file);
  const res = await fetch(`${API_URL}/api/uploads/avatar`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}
