'use strict';

function deleteCookie(cookie) {
  // Cookie deletion is largely modeled off of how deleting cookies works when using HTTP headers.
  // Specific flags on the cookie object like `secure` or `hostOnly` are not exposed for deletion
  // purposes. Instead, cookies are deleted by URL, name, and storeId. Unlike HTTP headers, though,
  // we don't have to delete cookies by setting Max-Age=0; we have a method for that ;)
  //
  // To remove cookies set with a Secure attribute, we must provide the correct protocol in the
  // details object's `url` property.
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#Secure
  const protocol = cookie.secure ? 'https:' : 'http:';

  // Note that the final URL may not be valid. The domain value for a standard cookie is prefixed
  // with a period (invalid) while cookies that are set to `cookie.hostOnly == true` do not have
  // this prefix (valid).
  // https://developer.chrome.com/docs/extensions/reference/cookies/#type-Cookie
  const cookieUrl = `${protocol}//${cookie.domain}${cookie.path}`;

  return chrome.cookies.remove({
    url: cookieUrl,
    name: cookie.name,
    partitionKey: cookie.partitionKey,
    storeId: cookie.storeId
  });
}

chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.name === 'VISITOR_PRIVACY_METADATA') {
    console.log("caonima cookie changed", changeInfo);
    if (!changeInfo.removed) {
      const ret = deleteCookie(changeInfo.cookie);
      console.log("delete cookie", ret);
    }
  }
});

setInterval(() => {
  chrome.cookies.getAll({
    domain: ".youtube.com",
    partitionKey: {topLevelSite: "https://youtube.com"},
    name: "VISITOR_PRIVACY_METADATA"
  }, (cookies) => {
    if (cookies.length > 0) {
      cookies.map(deleteCookie);
      console.log("periodically delete cookie");
    }
  });
}, 1000);

console.log('Service worker started.');