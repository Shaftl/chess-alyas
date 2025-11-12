// frontend/store/store.js
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/store/slices/authSlice";
import gameReducer from "@/store/slices/gameSlice";
import challengeReducer from "@/store/slices/challengeSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    game: gameReducer,
    challenge: challengeReducer, // NEW
  },
});
