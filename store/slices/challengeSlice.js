// frontend/store/slices/challengeSlice.js
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  incoming: null, // { challengeId, from: { id, username, avatarUrl... }, minutes, colorPreference, ts }
};

const slice = createSlice({
  name: "challenge",
  initialState,
  reducers: {
    setIncomingChallenge(state, action) {
      state.incoming = action.payload;
    },
    clearIncomingChallenge(state) {
      state.incoming = null;
    },
  },
});

export const { setIncomingChallenge, clearIncomingChallenge } = slice.actions;
export default slice.reducer;
