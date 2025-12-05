// frontend/store/slices/authSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { backendOrigin } from "@/lib/chessUtils";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function ensureAvatarAbsolute(user) {
  if (!user || typeof user !== "object") return user;
  const base = backendOrigin();

  // avatar normalization
  const rel = user.avatarUrl || user.avatar || null;
  if (!rel) {
    user.avatarUrlAbsolute = user.avatarUrlAbsolute || null;
  } else if (/^https?:\/\//i.test(rel)) {
    user.avatarUrlAbsolute = rel;
    user.avatarUrl = rel;
  } else {
    user.avatarUrlAbsolute = `${base.replace(/\/$/, "")}${
      rel.startsWith("/") ? "" : "/"
    }${rel}`;
    user.avatarUrl = rel;
  }

  // background normalization
  const relBg = user.backgroundUrl || null;
  if (!relBg) {
    user.backgroundUrlAbsolute = user.backgroundUrlAbsolute || null;
  } else if (/^https?:\/\//i.test(relBg)) {
    user.backgroundUrlAbsolute = relBg;
    user.backgroundUrl = relBg;
  } else {
    user.backgroundUrlAbsolute = `${base.replace(/\/$/, "")}${
      relBg.startsWith("/") ? "" : "/"
    }${relBg}`;
    user.backgroundUrl = relBg;
  }

  return user;
}

export const loadUserFromCookie = createAsyncThunk(
  "auth/loadUserFromCookie",
  async (_, thunkAPI) => {
    try {
      const res = await axios.get(`${API}/auth/me`, { withCredentials: true });
      return res.data;
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data || { error: err.message }
      );
    }
  }
);

export const registerUser = createAsyncThunk(
  "auth/registerUser",
  async ({ username, email, password, clientIp, dob }, thunkAPI) => {
    try {
      const payload = { username, email, password };
      if (clientIp) payload.clientIp = clientIp;
      if (dob) payload.dob = dob;
      const res = await axios.post(`${API}/auth/register`, payload, {
        withCredentials: true,
      });
      return res.data;
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data || { error: err.message }
      );
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async ({ email, password }, thunkAPI) => {
    try {
      const res = await axios.post(
        `${API}/auth/login`,
        { email, password },
        { withCredentials: true }
      );
      return res.data;
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data || { error: err.message }
      );
    }
  }
);

export const logoutUser = createAsyncThunk(
  "auth/logoutUser",
  async (_, thunkAPI) => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      return { ok: true };
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data || { error: err.message }
      );
    }
  }
);

const initialState = {
  user: null,
  token: null,
  loading: false,
  error: null,
  initialized: false,
};

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      state.loading = false;
      state.error = null;
      state.initialized = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerUser.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(registerUser.fulfilled, (s, a) => {
        s.loading = false;
        s.token = a.payload.token || null;
        let user = a.payload.user || null;
        if (user) user = ensureAvatarAbsolute(user);
        s.user = user;
        s.initialized = true;
      })
      .addCase(registerUser.rejected, (s, a) => {
        s.loading = false;
        s.error = a.payload || a.error;
        s.initialized = true;
      })
      .addCase(loginUser.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(loginUser.fulfilled, (s, a) => {
        s.loading = false;
        s.token = a.payload.token || null;
        let user = a.payload.user || null;
        if (user) user = ensureAvatarAbsolute(user);
        s.user = user;
        s.initialized = true;
      })
      .addCase(loginUser.rejected, (s, a) => {
        s.loading = false;
        s.error = a.payload || a.error;
        s.initialized = true;
      })
      .addCase(loadUserFromCookie.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(loadUserFromCookie.fulfilled, (s, a) => {
        s.loading = false;
        let user = a.payload || null;
        if (user) user = ensureAvatarAbsolute(user);
        s.user = user;
        s.token = null;
        s.initialized = true;
      })
      .addCase(loadUserFromCookie.rejected, (s) => {
        s.loading = false;
        s.user = null;
        s.token = null;
        s.error = null;
        s.initialized = true;
      })
      .addCase(logoutUser.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(logoutUser.fulfilled, (s) => {
        s.loading = false;
        s.user = null;
        s.token = null;
        s.initialized = true;
      })
      .addCase(logoutUser.rejected, (s) => {
        s.loading = false;
        s.user = null;
        s.token = null;
        s.initialized = true;
      });
  },
});

export const { logout } = slice.actions;
export default slice.reducer;
