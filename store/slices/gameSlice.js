// frontend/store/slices/gameSlice.js
import { createSlice } from "@reduxjs/toolkit";

const MAX_MESSAGES = 500;

const initialState = {
  roomId: null,
  fen: null,
  moves: [],
  players: [],
  joined: false,
  lastIndex: -1,
  playerColor: null, // 'w'|'b'|'spectator' for this client
  lastMove: null,

  // chat/messages
  messages: [], // { id, user, text, ts }
};

const slice = createSlice({
  name: "game",
  initialState,
  reducers: {
    setRoomId(state, action) {
      state.roomId = action.payload;
    },
    setPlayerColor(state, action) {
      state.playerColor = action.payload;
    },
    joinRoomSuccess(state, action) {
      state.joined = true;
      state.players = action.payload.players || [];
      state.fen = action.payload.fen || state.fen;
      state.moves = action.payload.moves || state.moves;
      state.lastIndex = action.payload.lastIndex ?? state.lastIndex;
      // If server sent messages (chat), accept them
      if (Array.isArray(action.payload.messages)) {
        state.messages = action.payload.messages.slice(-MAX_MESSAGES);
      }
    },
    opponentMove(state, action) {
      state.moves.push(action.payload);
      state.lastMove = action.payload;
      if (action.payload.fen) state.fen = action.payload.fen;
      if (typeof action.payload.index !== "undefined")
        state.lastIndex = action.payload.index;
    },
    localMove(state, action) {
      state.moves.push(action.payload);
      state.lastMove = action.payload;
      if (action.payload.fen) state.fen = action.payload.fen;
    },
    leaveRoom(state) {
      state.joined = false;
      state.roomId = null;
      state.players = [];
      state.moves = [];
      state.fen = null;
      state.playerColor = null;
      state.lastIndex = -1;
      state.lastMove = null;
      state.messages = [];
    },
    setFen(state, action) {
      state.fen = action.payload;
    },

    // --- Chat reducers ---
    // addMessage: push a single message object and cap the array length
    addMessage(state, action) {
      const msg = action.payload;
      if (!msg) return;
      state.messages = state.messages || [];
      state.messages.push(msg);
      if (state.messages.length > MAX_MESSAGES) {
        state.messages = state.messages.slice(-MAX_MESSAGES);
      }
    },

    // setMessages: replace messages array (used when syncing room)
    setMessages(state, action) {
      const arr = Array.isArray(action.payload) ? action.payload : [];
      state.messages = arr.slice(-MAX_MESSAGES);
    },
  },
});

export const {
  setRoomId,
  setPlayerColor,
  joinRoomSuccess,
  opponentMove,
  localMove,
  leaveRoom,
  setFen,
  // chat
  addMessage,
  setMessages,
} = slice.actions;

export default slice.reducer;
