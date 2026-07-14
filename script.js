// --- FIREBASE INITIALIZATION ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    sendEmailVerification, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, 
    addDoc, onSnapshot, orderBy, serverTimestamp, deleteDoc, arrayUnion, arrayRemove
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
let threadsUnsubscribe = null; 
let socialRequestsUnsubscribe = null;
let currentDropsUser = null; 
let currentDrops = []; 
let currentReplyTarget = null;
let currentReplySnippet = null;

// =========================================================================
// THE GATEKEEPER NAVIGATION ENGINE
// =========================================================================
function setView(viewName) {
    document.getElementById('loginWrapper')?.classList.remove('active');
    document.getElementById('dmWrapper')?.classList.remove('active');
    document.getElementById('settingsWrapper')?.classList.remove('active');
    document.getElementById('socialWrapper')?.classList.remove('active');
    document.getElementById('chatRoom')?.classList.remove('active');
    document.getElementById('dropsWrapper')?.classList.remove('active'); 
    
    document.getElementById('mainGreeting')?.classList.add('ui-hidden');
    document.getElementById('mainBottom')?.classList.add('ui-hidden');
    document.getElementById('mainDock')?.classList.add('ui-hidden');
    document.getElementById('mainThreads')?.classList.add('ui-hidden'); 

    if (viewName === 'home') {
        document.getElementById('mainGreeting')?.classList.remove('ui-hidden');
        document.getElementById('mainBottom')?.classList.remove('ui-hidden');
        document.getElementById('mainDock')?.classList.remove('ui-hidden');
        document.getElementById('mainThreads')?.classList.remove('ui-hidden'); 
        
        if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
        if (window.dropsUnsubscribe) { window.dropsUnsubscribe(); window.dropsUnsubscribe = null; } 
    } else {
        document.getElementById(viewName)?.classList.add('active');
    }
}

// =========================================================================
// TIME AGO FORMATTER (For Notifications)
// =========================================================================
function timeAgo(firebaseTimestamp) {
    if (!firebaseTimestamp) return "Just now";
    const date = firebaseTimestamp.toDate();
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "m ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";
    const days = Math.floor(hours / 24);
    return days + "d ago";
}

// =========================================================================
// DOM CONTENT LOADED: ATTACH ALL EVENT LISTENERS SAFELY
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {

    // --- FIX 3: THE GLOBAL TYPING LISTENER (Catches Everything!) ---
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT') {
            document.body.classList.add('typing-mode');
        }
    });

    document.addEventListener('focusout', (e) => {
        if (e.target.tagName === 'INPUT') {
            document.body.classList.remove('typing-mode');
            setTimeout(() => { 
                window.scrollTo(0, 0); 
                document.body.scrollTop = 0; 
                document.documentElement.scrollTop = 0; 
            }, 100); 
        }
    });

    // --- TOP RIGHT CONTROLS (Social & Close) ---
    document.getElementById('socialUserBtn')?.addEventListener('click', () => {
        if (!currentUser) return alert("Please login first!");
        setView('socialWrapper');
        loadSocialTab('search');
    });

    document.getElementById('socialNotiBtn')?.addEventListener('click', () => {
        if (!currentUser) return alert("Please login first!");
        setView('socialWrapper');
        loadSocialTab('requests');
    });

    document.getElementById('closeBtn')?.addEventListener('click', () => {
        if (document.getElementById('chatRoom')?.classList.contains('active')) {
            document.getElementById('chatRoom').classList.remove('active');
            if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
            const dmSearch = document.getElementById('dmSearch');
            if(dmSearch) dmSearch.value = "";
            listenToChatHistory();
        } else {
            setView('home');
        }
    });

    // --- SOCIAL TABS LOGIC ---
    document.querySelectorAll('.social-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            loadSocialTab(e.target.getAttribute('data-tab'));
        });
    });

    // --- DOCKBAR CONTROLS ---
    document.getElementById('loginBtn')?.addEventListener('click', () => {
        if (currentUser) {
            const dmSearch = document.getElementById('dmSearch');
            if(dmSearch) dmSearch.value = ""; 
            listenToChatHistory();
            setView('dmWrapper');
        } else {
            setView('loginWrapper');
        }
    });

    document.getElementById('settingsBtn')?.addEventListener('click', async () => {
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

    document.getElementById('dropsBtn')?.addEventListener('click', () => {
        if (!currentUser) return alert("Please login to see and share drops!");
        loadDropsForUser(currentUser.uid, document.getElementById('userName').innerText);
        setView('dropsWrapper');
    });

    // --- WALLPAPER / THEME ---
    document.getElementById('wallpaperBtn')?.addEventListener('click', () => document.getElementById('themeModal').classList.add('active'));
    document.getElementById('themeModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('themeModal')) document.getElementById('themeModal').classList.remove('active');
    });
    
    // NEW: Contains the 4 new wallpapers with matching color palettes.
    const themeMap = {
        'beige.jpg': { text: '#4A4036', bgSolid: '#F9F6F0', bgSurface: '#FFFFFF', bgHover: '#EBE4DA' },
        'black.jpg': { text: '#D9C8B8', bgSolid: '#1C1C1E', bgSurface: '#2C2C2E', bgHover: '#3A3A3C' },
        'white.jpg': { text: '#5C5046', bgSolid: '#F5F5F7', bgSurface: '#FFFFFF', bgHover: '#E8E8ED' },
        'pink.jpg': { text: '#6B4C4A', bgSolid: '#FDF6F7', bgSurface: '#FFFFFF', bgHover: '#F7E5E6' },
        'crimson.jpg': { text: '#F4D9E0', bgSolid: '#3E0B19', bgSurface: '#4F1223', bgHover: '#63182D' },
        'ocean.jpg': { text: '#D9E2F4', bgSolid: '#0C1631', bgSurface: '#15254A', bgHover: '#1C3160' },
        'rexgreen.jpg': { text: '#F0F4EB', bgSolid: '#545C44', bgSurface: '#656E54', bgHover: '#747E61' },
        'cookiegreen.jpg': { text: '#404F43', bgSolid: '#F2F6F3', bgSurface: '#FFFFFF', bgHover: '#E4EAE5' }
    };

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

    // --- AUTHENTICATION MODULE ---
    document.getElementById('submitLogin')?.addEventListener('click', async () => {
        const loginInput = document.getElementById('emailInput').value.trim().toLowerCase();
        const password = document.getElementById('passInput').value;
        if (!loginInput || password.length < 6) return alert("Please enter a valid email or username, and a 6+ char password.");
        let emailToUse = loginInput;

        try {
            if (!loginInput.includes('@')) {
                const userQuery = query(collection(db, "users"), where("username", "==", loginInput));
                const querySnapshot = await getDocs(userQuery);
                if (querySnapshot.empty) return alert("Username not found! If you are new, please use an email to sign up.");
                emailToUse = querySnapshot.docs[0].data().email; 
            }

            const cred = await signInWithEmailAndPassword(auth, emailToUse, password);
            if (cred.user.emailVerified) setView('dmWrapper');
            else { alert("Verify your email first!"); await signOut(auth); }
        } catch (e) {
            if (loginInput.includes('@')) {
                try {
                    const userCred = await createUserWithEmailAndPassword(auth, emailToUse, password);
                    await sendEmailVerification(userCred.user);
                    alert("Account created! Check your email for the verification link.");
                    await signOut(auth); setView('home'); 
                } catch (err) { alert("Error: " + err.message); }
            } else { alert("Incorrect password for this username."); }
        }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
            await signOut(auth);
            document.getElementById('usernameInput').value = "";
            document.getElementById('pfpPreview').src = "cloud.png";
            if(document.getElementById('dmSearch')) document.getElementById('dmSearch').value = "";
            if(document.getElementById('dmListContainer')) document.getElementById('dmListContainer').innerHTML = "";
            alert("Logged out successfully!");
            setView('home');
        } catch (e) { alert(e.message); }
    });

    // --- PROFILE SAVING ---
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    saveSettingsBtn?.addEventListener('click', async () => {
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

            await setDoc(doc(db, "users", currentUser.uid), { username: username, pfpUrl: pfpUrl, email: currentUser.email }, { merge: true });
            document.getElementById('userName').innerText = username; 
            alert("Profile saved successfully!");
        } catch (e) { alert("Error: " + e.message); }
        saveSettingsBtn.innerText = "Save Profile";
    });

    document.getElementById('changePfpBtn')?.addEventListener('click', () => document.getElementById('pfpInput').click());
    document.getElementById('pfpInput')?.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const pfp = document.getElementById('pfpPreview');
                if(pfp) pfp.src = ev.target.result;
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    // --- THREADS CONTROLS ---
    document.getElementById('toggleThreadsBtn')?.addEventListener('click', () => {
        document.getElementById('threadsGlassBox').classList.toggle('flipped');
    });

    document.getElementById('threadSendBtn')?.addEventListener('click', postGlobalThread);
    document.getElementById('threadInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') postGlobalThread();
    });

    document.getElementById('cancelReplyBtn')?.addEventListener('click', () => {
        currentReplyTarget = null;
        currentReplySnippet = null;
        document.getElementById('replyPreviewBanner').style.display = 'none';
    });

    // --- DIRECT MESSAGES (CHAT) CONTROLS ---
    document.getElementById('chatSendBtn')?.addEventListener('click', executeSendMessage);
    document.getElementById('chatInputField')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') executeSendMessage(); });

    const dmSearchInput = document.getElementById('dmSearch');
    if (dmSearchInput) {
        const fakeForm = document.createElement('form');
        fakeForm.setAttribute('action', 'javascript:void(0);');
        fakeForm.style.width = '100%'; fakeForm.style.margin = '0'; fakeForm.style.padding = '0';
        fakeForm.onsubmit = (e) => { e.preventDefault(); dmSearchInput.blur(); return false; };
        dmSearchInput.parentNode.insertBefore(fakeForm, dmSearchInput);
        fakeForm.appendChild(dmSearchInput);

        dmSearchInput.addEventListener('input', async (e) => {
            const queryStr = e.target.value.trim().toLowerCase();
            if (!queryStr) { listenToChatHistory(); return; }
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
    }

    // --- PHOTO DROPS CONTROLS ---
    document.getElementById('pickNclickBtn')?.addEventListener('click', () => {
        if (currentDropsUser !== currentUser.uid) loadDropsForUser(currentUser.uid, document.getElementById('userName').innerText);
        document.getElementById('dropFileInput').click();
    });

    document.getElementById('dropFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const btn = document.getElementById('pickNclickBtn');
        btn.innerText = "Uploading... ⏳";
        
        try {
            const fd = new FormData(); fd.append("image", file);
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) await addDoc(collection(db, "users", currentUser.uid, "drops"), { imageUrl: data.data.url, timestamp: serverTimestamp() });
        } catch (err) { alert("Upload failed: " + err.message); }
        
        btn.innerText = "PickNclick 📷";
        e.target.value = ""; 
    });

    document.getElementById('eraseDropBtn')?.addEventListener('click', async () => {
        if (currentDrops.length === 0 || currentDropsUser !== currentUser.uid) return;
        if (!confirm("Erase this drop forever?")) return;
        const topDrop = currentDrops[0]; 
        try { await deleteDoc(doc(db, "users", currentUser.uid, "drops", topDrop.id)); } catch (err) { console.error("Failed to delete", err); }
    });

    const dropSearchInput = document.getElementById('dropSearch');
    const dropSearchResults = document.getElementById('dropSearchResults');
    if (dropSearchInput) {
        dropSearchInput.addEventListener('input', async (e) => {
            const queryStr = e.target.value.trim().toLowerCase();
            if (!queryStr) return dropSearchResults.classList.remove('active');

            try {
                const usersRef = collection(db, "users");
                let results = [];
                const qUsername = query(usersRef, where("username", "==", queryStr));
                const snapU = await getDocs(qUsername);
                snapU.forEach(d => { results.push({ uid: d.id, ...d.data() }) });

                if (results.length === 0 && queryStr.length >= 2) {
                    const qPrefix = query(usersRef, where("username", ">=", queryStr), where("username", "<=", queryStr + '\uf8ff'));
                    const snapP = await getDocs(qPrefix);
                    snapP.forEach(d => { if (!results.some(r => r.uid === d.id)) results.push({ uid: d.id, ...d.data() }); });
                }
                
                dropSearchResults.innerHTML = "";
                if (results.length === 0) {
                    dropSearchResults.innerHTML = `<div style="padding:10px; color:var(--greeting-color); text-align:center;">No users found</div>`;
                } else {
                    results.forEach(user => {
                        const item = document.createElement('div');
                        item.className = 'dm-user-item'; item.style.padding = "10px";
                        item.innerHTML = `
                            <div class="dm-avatar" style="width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                <img src="${user.pfpUrl || 'cloud.png'}" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                            <div class="dm-username" style="margin-left:10px; font-size:1rem; font-weight:600;">${user.username}</div>
                        `;
                        item.addEventListener('click', () => {
                            loadDropsForUser(user.uid, user.username);
                            dropSearchInput.value = ""; dropSearchResults.classList.remove('active');
                        });
                        dropSearchResults.appendChild(item);
                    });
                }
                dropSearchResults.classList.add('active');
            } catch (err) { console.error("Drop search error:", err); }
        });

        dropSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); dropSearchInput.blur(); } });
    }
});

// =========================================================================
// CORE GLOBAL AUTH LISTENER
// =========================================================================
onAuthStateChanged(auth, async (user) => {
    if (user && user.emailVerified) {
        currentUser = user;
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (profileSnap.exists()) {
            const currentUsername = profileSnap.data().username || "User";
            const userNameEl = document.getElementById('userName');
            if(userNameEl) userNameEl.innerText = currentUsername;
            
            // Temporary VIP Logic
            const spotBtn = document.getElementById('spotifyBtn');
            const pinBtn = document.getElementById('pinterestBtn');
            const VIP_USERNAMES = ["mahinxyz", "mahin", "her_username1", "her_username2"]; 
            if(spotBtn && pinBtn) {
                if (VIP_USERNAMES.includes(currentUsername.toLowerCase())) {
                    spotBtn.style.display = 'flex'; pinBtn.style.display = 'flex';
                } else {
                    spotBtn.style.display = 'none'; pinBtn.style.display = 'none';
                }
            }
        }
        listenToChatHistory();
        listenToGlobalThreads(); 
    } else {
        currentUser = null;
        const userNameEl = document.getElementById('userName');
        if(userNameEl) userNameEl.innerText = "User";
        
        const spotBtn = document.getElementById('spotifyBtn');
        const pinBtn = document.getElementById('pinterestBtn');
        if (spotBtn) spotBtn.style.display = 'none';
        if (pinBtn) pinBtn.style.display = 'none';
        
        if (threadsUnsubscribe) { threadsUnsubscribe(); threadsUnsubscribe = null; }
        const threadsContainer = document.getElementById('threadsFeedContainer');
        if(threadsContainer) threadsContainer.innerHTML = '<div style="text-align:center; opacity:0.5; font-size:0.9rem; margin-top:20px;">Login to view threads</div>';
        
        if (historyUnsubscribe) { historyUnsubscribe(); historyUnsubscribe = null; }
        if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    }
});


// =========================================================================
// SOCIAL ENGINE (Search, Friends, Requests)
// =========================================================================
function loadSocialTab(tabName) {
    document.querySelectorAll('.social-tab').forEach(b => b.classList.remove('active'));
    const targetTab = document.querySelector(`.social-tab[data-tab="${tabName}"]`);
    if(targetTab) targetTab.classList.add('active');
    
    const content = document.getElementById('socialContentArea');
    if(!content) return;
    content.innerHTML = '';
    
    if (socialRequestsUnsubscribe) {
        socialRequestsUnsubscribe(); 
        socialRequestsUnsubscribe = null;
    }

    if (tabName === 'search') {
        content.innerHTML = `
            <input type="text" id="socialSearchInput" class="login-input" placeholder="Search users..." autocomplete="off" style="margin-bottom: 15px; flex-shrink:0;">
            <div id="socialSearchResults" style="width:100%; display:flex; flex-direction:column; gap:10px;"></div>
        `;
        const searchInput = document.getElementById('socialSearchInput');
        if(searchInput) {
            searchInput.focus();
            searchInput.addEventListener('input', async (e) => {
                const queryStr = e.target.value.trim().toLowerCase();
                const resultsDiv = document.getElementById('socialSearchResults');
                if (!queryStr) { resultsDiv.innerHTML = ''; return; }
                
                try {
                    const usersRef = collection(db, "users");
                    let results = [];
                    const qUsername = query(usersRef, where("username", "==", queryStr));
                    const snapU = await getDocs(qUsername);
                    snapU.forEach(d => { if(d.id !== currentUser.uid) results.push({ uid: d.id, ...d.data() }) });

                    if (results.length === 0 && queryStr.length >= 2) {
                        const qPrefix = query(usersRef, where("username", ">=", queryStr), where("username", "<=", queryStr + '\uf8ff'));
                        const snapP = await getDocs(qPrefix);
                        snapP.forEach(d => { if(d.id !== currentUser.uid && !results.some(r => r.uid === d.id)) results.push({ uid: d.id, ...d.data() }) });
                    }

                    resultsDiv.innerHTML = "";
                    if (results.length === 0) {
                        resultsDiv.innerHTML = `<div style="text-align:center; opacity:0.5; padding:20px;">No users found</div>`;
                    } else {
                        results.forEach(user => {
                            const item = document.createElement('div');
                            item.className = 'dm-user-item';
                            item.innerHTML = `
                                <img src="${user.pfpUrl || 'cloud.png'}" style="width:45px; height:45px; border-radius:15px; object-fit:cover; flex-shrink:0;">
                                <div style="font-weight:600; font-size:1.05rem; margin-left:10px;" class="dm-username">${user.username}</div>
                            `;
                            item.addEventListener('click', () => renderInstagramProfile(user));
                            resultsDiv.appendChild(item);
                        });
                    }
                } catch (err) { console.error(err); }
            });
        }
    } 
    else if (tabName === 'friends') {
        renderFriendsTab(content);
    } 
    else if (tabName === 'requests') {
        renderRequestsTab(content);
    }
}

async function renderFriendsTab(content) {
    content.innerHTML = `<div style="text-align:center; opacity:0.5; padding:20px;">Loading...</div>`;
    try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        const friendsArray = snap.data().friends || [];
        
        if (friendsArray.length === 0) {
            content.innerHTML = `<div style="text-align:center; opacity:0.5; padding:20px;">No friends added yet.</div>`;
            return;
        }

        content.innerHTML = "";
        for (const friendUid of friendsArray) {
            const fSnap = await getDoc(doc(db, "users", friendUid));
            if (fSnap.exists()) {
                const user = fSnap.data();
                const item = document.createElement('div');
                item.className = 'dm-user-item';
                item.innerHTML = `
                    <img src="${user.pfpUrl || 'cloud.png'}" style="width:45px; height:45px; border-radius:15px; object-fit:cover; flex-shrink:0;">
                    <div style="font-weight:600; font-size:1.05rem; margin-left:10px; flex:1;" class="dm-username">${user.username}</div>
                    <button class="req-btn decline" style="font-size:0.8rem; width:auto; padding:0 10px; border-radius:15px;">Remove</button>
                `;
                item.addEventListener('click', (e) => {
                    if(!e.target.classList.contains('req-btn')) renderInstagramProfile({uid: friendUid, ...user});
                });
                item.querySelector('.req-btn').addEventListener('click', async () => {
                    if(confirm(`Remove ${user.username} from friends?`)) {
                        await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayRemove(friendUid) });
                        await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(currentUser.uid) });
                        renderFriendsTab(content);
                    }
                });
                content.appendChild(item);
            }
        }
    } catch (e) { console.error(e); }
}

function renderRequestsTab(content) {
    content.innerHTML = `<div style="text-align:center; opacity:0.5; padding:20px;">Loading...</div>`;
    const reqRef = collection(db, "friend_requests");
    const q = query(reqRef, where("to", "==", currentUser.uid));

    socialRequestsUnsubscribe = onSnapshot(q, async (snapshot) => {
        content.innerHTML = "";
        if (snapshot.empty) {
            content.innerHTML = `<div style="text-align:center; opacity:0.5; padding:20px;">No pending requests.</div>`;
            return;
        }

        for (const requestDoc of snapshot.docs) {
            const data = requestDoc.data();
            const fSnap = await getDoc(doc(db, "users", data.from));
            if (fSnap.exists()) {
                const user = fSnap.data();
                const item = document.createElement('div');
                item.className = 'req-item';
                item.innerHTML = `
                    <img src="${user.pfpUrl || 'cloud.png'}" class="req-avatar">
                    <div class="req-info">
                        <span class="req-name">${user.username}</span>
                        <span class="req-time">${timeAgo(data.timestamp)}</span>
                    </div>
                    <div class="req-actions">
                        <button class="req-btn accept" id="acc_${requestDoc.id}">✓</button>
                        <button class="req-btn decline" id="dec_${requestDoc.id}">✖</button>
                    </div>
                `;
                content.appendChild(item);

                document.getElementById(`acc_${requestDoc.id}`).addEventListener('click', async () => {
                    await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayUnion(data.from) });
                    await updateDoc(doc(db, "users", data.from), { friends: arrayUnion(currentUser.uid) });
                    await deleteDoc(doc(db, "friend_requests", requestDoc.id));
                });
                document.getElementById(`dec_${requestDoc.id}`).addEventListener('click', async () => {
                    await deleteDoc(doc(db, "friend_requests", requestDoc.id));
                });
            }
        }
    });
}

// Instagram Style Profile View
async function renderInstagramProfile(user) {
    const content = document.getElementById('socialContentArea');
    if(!content) return;
    
    const meSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myFriends = meSnap.data().friends || [];
    const isFriend = myFriends.includes(user.uid);
    
    let isRequestedByMe = false;
    let isRequestedByThem = false;
    let reqIdMy = `${currentUser.uid}_${user.uid}`;
    let reqIdThem = `${user.uid}_${currentUser.uid}`;

    if (!isFriend) {
        const checkMyReq = await getDoc(doc(db, "friend_requests", reqIdMy));
        if (checkMyReq.exists()) isRequestedByMe = true;
        
        const checkThemReq = await getDoc(doc(db, "friend_requests", reqIdThem));
        if (checkThemReq.exists()) isRequestedByThem = true;
    }

    let primaryBtnHtml = "";
    if (isFriend) {
        primaryBtnHtml = `<button class="ig-btn-secondary" id="igRemoveBtn">Remove Friend</button>`;
    } else if (isRequestedByMe) {
        primaryBtnHtml = `<button class="ig-btn-secondary" id="igCancelBtn">Requested</button>`;
    } else if (isRequestedByThem) {
        primaryBtnHtml = `<button class="ig-btn-primary" id="igAcceptBtn">Accept Request</button>`;
    } else {
        primaryBtnHtml = `<button class="ig-btn-primary" id="igAddBtn">Add Friend</button>`;
    }

    let msgBtnHtml = isFriend ? `<button class="ig-btn-primary" id="igMsgBtn">Message</button>` : "";

    content.innerHTML = `
        <div class="ig-profile-view">
            <button class="ig-back-btn" id="igBackBtn">&lt; Back</button>
            <img src="${user.pfpUrl || 'cloud.png'}" class="ig-pfp">
            <h2 class="ig-username">${user.username}</h2>
            <div class="ig-btn-group">
                ${primaryBtnHtml}
                ${msgBtnHtml}
            </div>
        </div>
    `;

    document.getElementById('igBackBtn')?.addEventListener('click', () => loadSocialTab('search'));

    document.getElementById('igAddBtn')?.addEventListener('click', async () => {
        document.getElementById('igAddBtn').innerText = "Sending...";
        await setDoc(doc(db, "friend_requests", reqIdMy), { from: currentUser.uid, to: user.uid, timestamp: serverTimestamp() });
        renderInstagramProfile(user); 
    });
    
    document.getElementById('igCancelBtn')?.addEventListener('click', async () => {
        await deleteDoc(doc(db, "friend_requests", reqIdMy));
        renderInstagramProfile(user);
    });
    
    document.getElementById('igAcceptBtn')?.addEventListener('click', async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayUnion(user.uid) });
        await updateDoc(doc(db, "users", user.uid), { friends: arrayUnion(currentUser.uid) });
        await deleteDoc(doc(db, "friend_requests", reqIdThem));
        renderInstagramProfile(user);
    });
    
    document.getElementById('igRemoveBtn')?.addEventListener('click', async () => {
        if(confirm(`Remove ${user.username}?`)) {
            await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayRemove(user.uid) });
            await updateDoc(doc(db, "users", user.uid), { friends: arrayRemove(currentUser.uid) });
            renderInstagramProfile(user);
        }
    });
    
    document.getElementById('igMsgBtn')?.addEventListener('click', () => {
        openChatWindow(user.uid, user.username);
        setView('dmWrapper');
    });
}


// =========================================================================
// CHAT & MESSAGING ENGINE
// =========================================================================
function listenToChatHistory() {
    if (!currentUser) return;
    if (historyUnsubscribe) historyUnsubscribe();
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("participants", "array-contains", currentUser.uid));

    historyUnsubscribe = onSnapshot(q, async (snapshot) => {
        const dmSearch = document.getElementById('dmSearch');
        if (dmSearch && dmSearch.value.trim()) return;
        
        let activelyMessagedUsers = [];
        for (const roomDoc of snapshot.docs) {
            const data = roomDoc.data();
            const recipientUid = data.participants.find(id => id !== currentUser.uid);
            if (recipientUid) {
                const userDoc = await getDoc(doc(db, "users", recipientUid));
                if (userDoc.exists()) {
                    activelyMessagedUsers.push({ uid: recipientUid, ...userDoc.data(), lastUpdated: data.lastUpdated, lastMessage: data.lastMessage || "", lastSender: data.lastSender || "" });
                }
            }
        }
        activelyMessagedUsers.sort((a, b) => (b.lastUpdated?.toMillis() || Date.now()) - (a.lastUpdated?.toMillis() || Date.now()));
        renderUserListItems(activelyMessagedUsers, true);
    });
}

function renderUserListItems(usersArray, isHistory = false) {
    const container = document.getElementById('dmListContainer');
    if(!container) return;
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
                <div class="dm-username" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.1rem; font-weight: 600;">${user.username}</div>
                ${subText}
            </div>
        `;
        item.addEventListener('click', () => openChatWindow(user.uid, user.username));
        container.appendChild(item);
    });
}

async function openChatWindow(recipientUid, recipientUsername) {
    if (!recipientUid || typeof recipientUid !== 'string' || !currentUser) return;

    try {
        activeRecipientUid = recipientUid;
        document.getElementById('activeChatTitle').innerText = recipientUsername;
        activeChatId = currentUser.uid < recipientUid ? `${currentUser.uid}_${recipientUid}` : `${recipientUid}_${currentUser.uid}`;
        
        const dmSearch = document.getElementById('dmSearch');
        if(dmSearch) dmSearch.value = ""; 
        
        document.getElementById('chatRoom')?.classList.add('active');
        const messagesContainer = document.getElementById('chatMessagesContainer');
        if(!messagesContainer) return;
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
    } catch (error) { document.getElementById('chatRoom')?.classList.remove('active'); }
}

async function executeSendMessage() {
    const inputField = document.getElementById('chatInputField');
    if(!inputField) return;
    const txt = inputField.value.trim();
    if (!txt || !activeChatId) return;
    inputField.value = ""; 

    try {
        await addDoc(collection(db, "rooms", activeChatId, "messages"), { senderId: currentUser.uid, text: txt, timestamp: serverTimestamp() });
        await setDoc(doc(db, "rooms", activeChatId), { participants: [currentUser.uid, activeRecipientUid], lastUpdated: serverTimestamp(), lastMessage: txt, lastSender: currentUser.uid }, { merge: true });
    } catch (e) { console.error("Message send failure:", e); }
}


// =========================================================================
// GLOBAL THREADS ENGINE
// =========================================================================
function listenToGlobalThreads() {
    if (!currentUser) return;
    if (threadsUnsubscribe) threadsUnsubscribe();

    const threadsRef = collection(db, "global_threads");
    const q = query(threadsRef, orderBy("timestamp", "desc")); 

    threadsUnsubscribe = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('threadsFeedContainer');
        if(!container) return;
        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = `<div style="text-align:center; opacity:0.5; font-size:0.9rem; margin-top:20px;">No thoughts dropped yet. Be the first!</div>`;
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'thread-item';
            
            let timeString = "";
            if (data.timestamp) {
                const date = data.timestamp.toDate();
                timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            let quoteBlockHTML = "";
            if (data.replyToUser && data.replyToText) {
                quoteBlockHTML = `
                    <div class="thread-reply-quote" style="border-left: 2px solid var(--greeting-color); padding-left: 10px; margin-bottom: 8px; opacity: 0.8;">
                        <div style="font-size: 0.75rem; font-weight: 600;">Replying to @${data.replyToUser}</div>
                        <div style="font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${data.replyToText}</div>
                    </div>
                `;
            }

            item.innerHTML = `
                <div class="thread-user-info">
                    <div class="thread-avatar">
                        <img src="${data.pfpUrl || 'cloud.png'}" alt="Avatar">
                    </div>
                    <span class="thread-username">${data.username || 'User'}</span>
                </div>
                ${quoteBlockHTML}
                <div class="thread-text">${data.text}</div>
                <div class="thread-timestamp">${timeString}</div>
            `;
            
            item.addEventListener('click', () => {
                currentReplyTarget = data.username;
                currentReplySnippet = data.text; 
                const targetName = document.getElementById('replyTargetName');
                const targetSnippet = document.getElementById('replyTargetSnippet');
                const banner = document.getElementById('replyPreviewBanner');
                const input = document.getElementById('threadInput');
                
                if(targetName) targetName.innerText = `Replying to @${data.username}`;
                if(targetSnippet) targetSnippet.innerText = data.text;
                if(banner) banner.style.display = 'flex';
                if(input) input.focus();
            });

            container.appendChild(item);
        });
    });
}

async function postGlobalThread() {
    if (!currentUser) return alert("Please login to post a thread!");
    
    const inputField = document.getElementById('threadInput');
    if(!inputField) return;
    let txt = inputField.value.trim();
    if (!txt) return;

    const replyTarget = currentReplyTarget;
    const replySnippet = currentReplySnippet;

    inputField.value = ""; 
    
    currentReplyTarget = null;
    currentReplySnippet = null;
    const banner = document.getElementById('replyPreviewBanner');
    if(banner) banner.style.display = 'none';

    try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        let username = "User";
        let pfpUrl = "cloud.png";
        if (snap.exists()) {
            username = snap.data().username || "User";
            pfpUrl = snap.data().pfpUrl || "cloud.png";
        }

        await addDoc(collection(db, "global_threads"), {
            senderId: currentUser.uid,
            username: username,
            pfpUrl: pfpUrl,
            text: txt, 
            replyToUser: replyTarget || null,
            replyToText: replySnippet || null,
            timestamp: serverTimestamp()
        });
    } catch (e) { console.error("Thread post failure:", e); }
}

// =========================================================================
// DROPS ENGINE (STACKS)
// =========================================================================
function loadDropsForUser(uid, username) {
    currentDropsUser = uid;
    const title = document.getElementById('dropsTitle');
    const search = document.getElementById('dropSearch');
    const results = document.getElementById('dropSearchResults');
    if(title) title.innerText = `Dropped by - ${username}`;
    if(search) search.value = "";
    if(results) results.classList.remove('active');
    
    if (window.dropsUnsubscribe) window.dropsUnsubscribe();

    const dropsRef = collection(db, "users", uid, "drops");
    const q = query(dropsRef, orderBy("timestamp", "desc"));

    window.dropsUnsubscribe = onSnapshot(q, (snapshot) => {
        currentDrops = [];
        snapshot.forEach(d => currentDrops.push({ id: d.id, ...d.data() }));
        renderDropsStack();
    });
}

function renderDropsStack() {
    const container = document.getElementById('dropsStackContainer');
    if(!container) return;
    container.innerHTML = "";
    const eraseBtn = document.getElementById('eraseDropBtn');
    if(eraseBtn) eraseBtn.style.display = (currentDropsUser === currentUser.uid && currentDrops.length > 0) ? 'block' : 'none';

    if (currentDrops.length === 0) {
        container.innerHTML = `<div style="color:var(--greeting-color); opacity:0.5; font-size:1.1rem;">No drops yet!</div>`;
        return;
    }

    currentDrops.forEach((drop, index) => {
        const card = document.createElement('div');
        card.className = 'drop-card';
        const reverseIndex = currentDrops.length - index; 
        const scale = Math.max(0.75, 1 - (index * 0.08));
        const translateY = index * -30; 
        
        card.style.zIndex = reverseIndex;
        card.style.transform = `translateY(${translateY}px) scale(${scale})`;
        if (index > 3) card.style.opacity = '0'; 

        card.innerHTML = `<img src="${drop.imageUrl}" alt="Drop">`;
        
        card.addEventListener('click', () => {
            if (index === 0 && currentDrops.length > 1) {
                const topCard = currentDrops.shift();
                currentDrops.push(topCard);
                renderDropsStack(); 
            }
        });
        container.appendChild(card);
    });
}

// =========================================================================
// STRICT MOBILE VIEWPORT & BOUNCE LOCK
// =========================================================================
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) event.preventDefault(); 
    lastTouchEnd = now;
}, { passive: false });

document.addEventListener('gesturestart', (event) => event.preventDefault());

document.addEventListener('touchmove', (event) => {
    const isInsideScrollableList = event.target.closest('.dm-list, .chat-messages, .drop-search-results, .threads-feed, .social-content');
    if (!isInsideScrollableList) event.preventDefault(); 
}, { passive: false });
