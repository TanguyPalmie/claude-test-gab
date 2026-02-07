import { v4 as uuidv4 } from 'uuid';

const KEY = 'topten_client_id';

export function getClientId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(KEY, id);
  }
  return id;
}
