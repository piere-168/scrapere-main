import { apiLogin, apiLogout, apiMe, loadToken } from '../api/client.js';

let currentUser = null;
let listeners = [];
let authReady = false;

function notify() {
    if (!authReady) return;
    listeners.forEach((cb) => {
        try {
            cb(currentUser);
        } catch (err) {
            console.error('Auth listener error:', err);
        }
    });
}

export const auth = {
    get currentUser() {
        return currentUser;
    },
    async signInWithEmailAndPassword(email, password) {
        const data = await apiLogin(email, password);
        currentUser = { uid: data.user.id, email: data.user.email };
        notify();
        return currentUser;
    },
    async signOut() {
        await apiLogout();
        currentUser = null;
        notify();
    },
    onAuthStateChanged(cb) {
        listeners.push(cb);
        if (authReady) {
            cb(currentUser);
        }
    },
};

export async function bootstrapAuth() {
    await loadToken();
    const me = await apiMe();
    if (me) {
        currentUser = { uid: me.id, email: me.email };
    } else {
        currentUser = null;
    }
    authReady = true;
    notify();
}
