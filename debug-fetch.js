const DRIVE_URL = "https://script.google.com/macros/s/AKfycbzEW49QpT17jE2K-AryYIfXp98-i1WdZbR0gK5thfWNZ06bpqHfbjfvY7B0F76zoQUd/exec";

(async function () {
    try {
        console.log("Fetching: " + DRIVE_URL);
        const response = await fetch(DRIVE_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
            },
            redirect: "follow"
        });
        console.log("Status: " + response.status);
        console.log("Content-Type: " + response.headers.get("content-type"));
        console.log("Redirected: " + response.redirected);
        console.log("Url: " + response.url);

        const text = await response.text();
        console.log("Body Preview (first 500 chars):");
        console.log(text.substring(0, 500));

        try {
            const json = JSON.parse(text);
            console.log("JSON Parse Success!");
            console.log("Is Array: " + Array.isArray(json));
            if (Array.isArray(json)) {
                console.log("First Item: ", JSON.stringify(json[0]));
            }
        } catch (e) {
            console.log("JSON Parse Failed");
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
})();
