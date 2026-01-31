import { io } from "socket.io-client";

const SOCKET_URL = "https://api.jobberint.space";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
});
