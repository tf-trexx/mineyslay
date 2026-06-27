// --- FIREBASE INITIALIZATION ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    sendEmailVerification, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, 
    addDoc, onSnapshot, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGAAWcNd5NjpxuhPoVJZ2La2DQmzeNm-I",
  authDomain: "mahinslay.firebaseapp.com",
  projectId: "mahinslay",
  storageBucket: "mahinslay.firebasestorage.app",
  messagingSenderId: "341252240006",
  appId: "1:341252240006:web:36ef38e3cfcee655e75707",
  measurementId: "G-2THFD52B90"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const IMGBB_API_KEY = "10efd26456f3b6292712d1f035f64198"; 

// --- CONTEXT VARIABLES ---
let currentUser = null;
let activeChatId = null;
let activeRecipientUid = null;
let chatUnsubscribe = null;
let historyUnsubscribe = null;

// --- THE GATEKEEPER NAVIGATION ENGINE ---
function setView(viewName) {
    document.getElementById('loginWrapper').classList.remove('active');
    document.getElementById('dmWrapper').classList.remove('active');
    document.getElementById('settingsWrapper').classList.remove('active');
    document.getElementById('chatRoom').classList.remove('active');
    
    document.getElementById('mainGreeting').classList.add('ui-hidden');
    document.getElementById('mainBottom').classList.add('ui-hidden');
    document.getElementById('mainDock').classList.add('ui-hidden');

    if (viewName === 'home') {
        document.getElementById('mainGreeting').classList.remove('ui-hidden');
        document.getElementById('mainBottom').classList.remove('ui-hidden');
        document.getElementById('mainDock').classList.remove('ui-hidden');
        if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    } else {
        document.getElementById(viewName).classList.add('active');
    }
}

// --- CORE GLOBAL AUTH LISTENER ---
onAuthStateChanged(auth, async (user) => {
    if (user && user.emailVerified) {
        currentUser = user;
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (profileSnap.exists()) {
            document.getElementById('userName').innerText = profileSnap.data().username || "User";
        }
        listenToChatHistory();
    } else {
        currentUser = null;
        document.getElementById('userName').innerText = "User";
        if (historyUnsubscribe) { historyUnsubscribe(); historyUnsubscribe = null; }
        if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    }
});

// --- DOCKBAR CONTROLS ---
document.getElementById('loginBtn').addEventListener('click', () => {
    if (currentUser) {
        document.getElementById('dmSearch').value = ""; 
        listenToChatHistory();
        setView('dmWrapper');
    }
    else setView('loginWrapper');
});

document.getElementById('settingsBtn').addEventListener('click', async () => {
    if (!currentUser) {
        alert("Please login first to access your profile!");
        setView('loginWrapper'); 
        return;
    }
    
    document.getElementById('usernameInput').value = "";
    document.getElementById('pfpPreview').src = "cloud.png";
    setView('settingsWrapper');
    
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    if (snap.exists()) {
        document.getElementById('usernameInput').value = snap.data().username || "";
        document.getElementById('pfpPreview').src = snap.data().pfpUrl || "cloud.png";
    }
});

// CRASH-PROOF CLOSE BUTTON
document.getElementById('closeBtn').addEventListener('click', () => {
    try {
        if (document.getElementById('chatRoom').classList.contains('active')) {
            document.getElementById('chatRoom').classList.remove('active');
            if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
            document.getElementById('dmSearch').value = "";
            listenToChatHistory();
        } else {
            setView('home');
        }
    } catch (error) {
        document.getElementById('chatRoom').classList.remove('active');
        setView('home');
    }
});

// --- AUTHENTICATION MODULE (UPGRADED FOR USERNAME LOGIN) ---
document.getElementById('submitLogin').addEventListener('click', async () => {
    const loginInput = document.getElementById('emailInput').value.trim().toLowerCase();
    const password = document.getElementById('passInput').value;
    
    if (!loginInput || password.length < 6) return alert("Please enter a valid email or username, and a 6+ char password.");
    
    let emailToUse = loginInput;

    try {
        // THE BRIDGE: If no '@', treat it as a username and fetch the real email
        if (!loginInput.includes('@')) {
            const userQuery = query(collection(db, "users"), where("username", "==", loginInput));
            const querySnapshot = await getDocs(userQuery);
            
            if (querySnapshot.empty) {
                return alert("Username not found! If you are new, please use an email to sign up.");
            }
            // Swap the username for the real email hidden in their profile
            emailToUse = querySnapshot.docs[0].data().email; 
        }

        // Attempt login
        const cred = await signInWithEmailAndPassword(auth, emailToUse, password);
        
        if (cred.user.emailVerified) {
            setView('dmWrapper');
        } else { 
            alert("Verify your email first!"); 
            await signOut(auth); 
        }
        
    } catch (e) {
        // If login fails, check if they were trying to create a NEW account with an email
        if (loginInput.includes('@')) {
            try {
                const userCred = await createUserWithEmailAndPassword(auth, emailToUse, password);
                await sendEmailVerification(userCred.user);
                alert("Account created! Check your email for the verification link.");
                await signOut(auth); 
                setView('home'); 
            } catch (err) { alert("Error: " + err.message); }
        } else {
            // If they typed a username but got the password wrong
            alert("Incorrect password for this username.");
        }
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        document.getElementById('usernameInput').value = "";
        document.getElementById('pfpPreview').src = "cloud.png";
        document.getElementById('dmSearch').value = "";
        document.getElementById('dmListContainer').innerHTML = "";
        alert("Logged out successfully!");
        setView('home');
    } catch (e) { alert(e.message); }
});

// --- THE BLACK HOLE: MOBILE ENTER-KEY ANNIHILATOR ---
const dmSearchInput = document.getElementById('dmSearch');

const fakeForm = document.createElement('form');
fakeForm.setAttribute('action', 'javascript:void(0);');
fakeForm.style.width = '100%';
fakeForm.style.margin = '0';
fakeForm.style.padding = '0';

fakeForm.onsubmit = (e) => {
    e.preventDefault(); 
    dmSearchInput.blur(); 
    return false;
};

dmSearchInput.parentNode.insertBefore(fakeForm, dmSearchInput);
fakeForm.appendChild(dmSearchInput);

// Normal typing listener
dmSearchInput.addEventListener('input', async (e) => {
    const queryStr = e.target.value.trim().toLowerCase();
    
    if (!queryStr) {
        listenToChatHistory(); 
        return;
    }
    if (historyUnsubscribe) historyUnsubscribe();

    try {
        const usersRef = collection(db, "users");
        let results = [];
        
        const qUsername = query(usersRef, where("username", "==", queryStr));
        const qEmail = query(usersRef, where("email", "==", queryStr));

        const snapU = await getDocs(qUsername);
        const snapE = await getDocs(qEmail);

        snapU.forEach(d => { if(d.id !== currentUser.uid) results.push({ uid: d.id, ...d.data() })});
        snapE.forEach(d => { if(d.id !== currentUser.uid && !results.some(r => r.uid === d.id)) results.push({ uid: d.id, ...d.data() })});

        if (results.length === 0 && queryStr.length >= 2) {
            const qPrefix = query(usersRef, where("username", ">=", queryStr), where("username", "<=", queryStr + '\uf8ff'));
            const snapP = await getDocs(qPrefix);
            snapP.forEach(d => { if(d.id !== currentUser.uid) results.push({ uid: d.id, ...d.data() })});
        }
        renderUserListItems(results, false);
    } catch (err) { console.error("Search error:", err); }
});

// --- STRICT BOUNDARY LIST RENDERER ---
function renderUserListItems(usersArray, isHistory = false) {
    const container = document.getElementById('dmListContainer');
    container.innerHTML = "";

    if (usersArray.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--greeting-color); opacity:0.5; font-size: 1rem; pointer-events: none;">No profiles found</div>`;
        return;
    }

    usersArray.forEach(user => {
        const item = document.createElement('div');
        item.className = 'dm-user-item';
        
        const isDefaultIcon = !user.pfpUrl || user.pfpUrl.includes('cloud.png');
        const imgStyle = isDefaultIcon ? 'width: 60%; height: 60%; object-fit: contain;' : 'width: 100%; height: 100%; object-fit: cover;';

        let subText = "";
        if (isHistory && user.lastMessage) {
            const prefix = user.lastSender === currentUser.uid ? "You: " : "";
            subText = `<div style="font-size: 0.85rem; opacity: 0.7; font-weight: 400; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${prefix}${user.lastMessage}</div>`;
        } else if (!isHistory) {
            subText = `<div style="font-size: 0.85rem; opacity: 0.5; font-weight: 400; margin-top: 4px;">Tap to start chatting</div>`;
        }

        item.innerHTML = `
            <div class="dm-avatar" style="width: 50px; height: 50px; border-radius: 18px; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                <img src="${user.pfpUrl || 'cloud.png'}" alt="Avatar" style="${imgStyle}">
            </div>
            <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; justify-content: center; margin-left: 10px;">
                <div class="dm-username" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.1rem; font-weight: 600; color: var(--greeting-color);">${user.username}</div>
                ${subText}
            </div>
        `;
        item.addEventListener('click', () => openChatWindow(user.uid, user.username));
        container.appendChild(item);
    });
}

// --- DYNAMIC CHAT HISTORY ROUTINE ---
function listenToChatHistory() {
    if (!currentUser) return;
    if (historyUnsubscribe) historyUnsubscribe();

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("participants", "array-contains", currentUser.uid));

    historyUnsubscribe = onSnapshot(q, async (snapshot) => {
        if (document.getElementById('dmSearch').value.trim()) return;

        let activelyMessagedUsers = [];
        for (const roomDoc of snapshot.docs) {
            const data = roomDoc.data();
            const recipientUid = data.participants.find(id => id !== currentUser.uid);
            if (recipientUid) {
                const userDoc = await getDoc(doc(db, "users", recipientUid));
                if (userDoc.exists()) {
                    activelyMessagedUsers.push({ 
                        uid: recipientUid, 
                        ...userDoc.data(), 
                        lastUpdated: data.lastUpdated,
                        lastMessage: data.lastMessage || "",
                        lastSender: data.lastSender || ""
                    });
                }
            }
        }
        
        activelyMessagedUsers.sort((a, b) => (b.lastUpdated?.toMillis() || Date.now()) - (a.lastUpdated?.toMillis() || Date.now()));
        renderUserListItems(activelyMessagedUsers, true);
    });
}

// --- REAL-TIME CHAT ENGINE INTERACTION (GHOST CLICK BLOCKER) ---
async function openChatWindow(recipientUid, recipientUsername) {
    if (!recipientUid || typeof recipientUid !== 'string' || !currentUser) {
        console.warn("Ghost click prevented.");
        return;
    }

    try {
        activeRecipientUid = recipientUid;
        document.getElementById('activeChatTitle').innerText = recipientUsername;
        activeChatId = currentUser.uid < recipientUid ? `${currentUser.uid}_${recipientUid}` : `${recipientUid}_${currentUser.uid}`;
        
        document.getElementById('dmSearch').value = ""; 
        document.getElementById('chatRoom').classList.add('active');
        
        const messagesContainer = document.getElementById('chatMessagesContainer');
        messagesContainer.innerHTML = ""; 

        if (chatUnsubscribe) chatUnsubscribe();
        const msgsRef = collection(db, "rooms", activeChatId, "messages");
        const q = query(msgsRef, orderBy("timestamp", "asc"));

        chatUnsubscribe = onSnapshot(q, (snapshot) => {
            messagesContainer.innerHTML = "";
            snapshot.forEach(msgDoc => {
                const data = msgDoc.data();
                const msgBubble = document.createElement('div');
                msgBubble.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
                msgBubble.innerText = data.text;
                
                msgBubble.style.wordBreak = "break-word";
                msgBubble.style.whiteSpace = "pre-wrap";
                
                messagesContainer.appendChild(msgBubble);
            });
            messagesContainer.scrollTop = messagesContainer.scrollHeight; 
        });
    } catch (error) {
        console.error("Chat failed to open safely:", error);
        document.getElementById('chatRoom').classList.remove('active');
    }
}

// --- SEND MESSAGE LOGIC ---
async function executeSendMessage() {
    const inputField = document.getElementById('chatInputField');
    const txt = inputField.value.trim();
    if (!txt || !activeChatId) return;

    inputField.value = ""; 

    try {
        await addDoc(collection(db, "rooms", activeChatId, "messages"), {
            senderId: currentUser.uid,
            text: txt,
            timestamp: serverTimestamp()
        });
        
        await setDoc(doc(db, "rooms", activeChatId), {
            participants: [currentUser.uid, activeRecipientUid],
            lastUpdated: serverTimestamp(),
            lastMessage: txt,
            lastSender: currentUser.uid
        }, { merge: true });

    } catch (e) { console.error("Message send failure:", e); }
}

document.getElementById('chatSendBtn').addEventListener('click', executeSendMessage);
document.getElementById('chatInputField').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSendMessage();
});

// --- PROFILE MANIPULATION SAVING LOGIC ---
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
saveSettingsBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    const username = document.getElementById('usernameInput').value.trim().toLowerCase();
    const file = document.getElementById('pfpInput').files[0];
    
    if (!username) return alert("Please enter a username.");
    saveSettingsBtn.innerText = "Saving...";
    
    try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0].id !== currentUser.uid) {
            alert("This username is already taken!");
            saveSettingsBtn.innerText = "Save Profile";
            return;
        }

        let pfpUrl = document.getElementById('pfpPreview').src;
        if (file) {
            const fd = new FormData(); fd.append("image", file);
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) pfpUrl = data.data.url;
        }

        await setDoc(doc(db, "users", currentUser.uid), { 
            username: username, pfpUrl: pfpUrl, email: currentUser.email 
        }, { merge: true });
        
        document.getElementById('userName').innerText = username; 
        alert("Profile saved successfully!");
    } catch (e) { alert("Error: " + e.message); }
    saveSettingsBtn.innerText = "Save Profile";
});

// --- LOCAL SYSTEM ASSET LOAD PREVIEWS ---
document.getElementById('changePfpBtn').addEventListener('click', () => document.getElementById('pfpInput').click());
document.getElementById('pfpInput').addEventListener('change', (e) => {
    if (e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (ev) => document.getElementById('pfpPreview').src = ev.target.result;
        reader.readAsDataURL(e.target.files[0]);
    }
});

// --- WALLPAPER THEME MANAGEMENT ---
const themeMap = {
    'beige.jpg': { text: '#4A4036', bgSolid: '#F9F6F0', bgSurface: '#FFFFFF', bgHover: '#EBE4DA' },
    'black.jpg': { text: '#D9C8B8', bgSolid: '#1C1C1E', bgSurface: '#2C2C2E', bgHover: '#3A3A3C' },
    'white.jpg': { text: '#5C5046', bgSolid: '#F5F5F7', bgSurface: '#FFFFFF', bgHover: '#E8E8ED' },
    'pink.jpg': { text: '#6B4C4A', bgSolid: '#FDF6F7', bgSurface: '#FFFFFF', bgHover: '#F7E5E6' }
};
document.getElementById('wallpaperBtn').addEventListener('click', () => document.getElementById('themeModal').classList.add('active'));
document.getElementById('themeModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('themeModal')) document.getElementById('themeModal').classList.remove('active');
});
document.querySelectorAll('.wallpaper-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const bg = btn.getAttribute('data-bg');
        document.body.style.backgroundImage = `url('${bg}')`;
        const t = themeMap[bg] || themeMap['beige.jpg'];
        document.documentElement.style.setProperty('--greeting-color', t.text);
        document.documentElement.style.setProperty('--bg-solid', t.bgSolid);
        document.documentElement.style.setProperty('--bg-surface', t.bgSurface);
        document.documentElement.style.setProperty('--bg-hover', t.bgHover);
        document.getElementById('themeModal').classList.remove('active');
    });
});


// =========================================================================
// PATCHED: STRICT MOBILE VIEWPORT & BOUNCE LOCK
// =========================================================================

// 1. Mathematically kill double-tap to zoom (Crucial for iOS Safari)
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault(); // If tapped twice within 300ms, kill the zoom
    }
    lastTouchEnd = now;
}, { passive: false });

// 2. Kill Pinch-to-Zoom gestures
document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
});

// 3. Kill Rubber-Band Background Bouncing while keeping Chats scrollable
document.addEventListener('touchmove', (event) => {
    // Check if the user's finger is currently touching a list that WE want to be scrollable
    const isInsideScrollableList = event.target.closest('.dm-list, .chat-messages');
    
    // If their finger is NOT inside the chat list or DM list, kill the swipe!
    if (!isInsideScrollableList) {
        event.preventDefault(); 
    }
}, { passive: false });
