// The loader for vendored libraries (assessment plan, section 2). The libraries the plan adds
// (a CSV reader, a spreadsheet reader, a zip writer) are the publisher's own files in vendor/,
// unchanged. They are not part of bundle/app.js (tools/build-app.mjs refuses to import them) and
// index.html does not name them: a first visit does not fetch them. The page adds one as an
// ordinary <script> the first time it is needed.
//
//   loadVendor(file, globalName) -> Promise<the library>
//       file is the file's name in vendor/ ("papaparse.min.js"): a plain name, with no folder
//       in it, so the loader reads vendor/ and nothing else. globalName is the name the library
//       gives itself on the page ("Papa"), a name nothing else on the page has (the page's own
//       "name" or "top" would be handed back as if it were the library): the library must be a
//       build that attaches itself as a global, since this is a classic script. The address is
//       relative to the page, so it works under any subpath. Anything else for either of them
//       is refused, with a rejection and no request.
//
// A library is requested once, however often it is asked for: while the request is on its way
// every caller waits for the same one, and afterwards the library is on the page. Loading can
// fail: a computer that has gone offline, a missing file, a file that is not the library, or a
// request that has not answered after VENDOR_LOAD_TIMEOUT_MS. The script element is then removed
// and the attempt forgotten, so the next call tries again, and every caller that was waiting
// gets the same rejection (an Error). The caller must take the rejection and say what went
// wrong, in plain words of its own: nothing here shows anything or logs anything, and loadVendor
// never throws. (A file that arrives with status 200 and is not JavaScript also makes the
// browser report a script error of its own; a missing file or a lost connection does not. A
// browser can join a new request to one for the same address that is still open, so after a
// request that never answered, the next try may have to wait for that one to end. And removing
// the script does not stop the browser: a file that arrives after the wait is over still runs
// and sets its global, and the next call then finds the library on the page.)

import { VENDOR_LOAD_TIMEOUT_MS } from "./config-workflow.js";

const VENDOR_DIR = "vendor/";
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// file name -> the promise of its library, while its request is on its way
const loading = new Map();

// the library as the page has it now: undefined when it is not there, or when the page will not
// even let the name be read (a getter that throws)
function onPage(globalName) {
    try {
        return globalThis[globalName];
    } catch {
        return undefined;
    }
}

// loadVendor gives the library, loading its file first when the page does not have it yet.
export function loadVendor(file, globalName) {
    if (typeof file !== "string" || !PLAIN_NAME.test(file) || file.includes("..")) {
        return Promise.reject(new Error(`not a file of ${VENDOR_DIR}`));
    }
    if (typeof globalName !== "string" || !globalName) {
        return Promise.reject(new Error("not the name of a library"));
    }
    const present = onPage(globalName);
    if (present !== undefined) {
        return Promise.resolve(present);
    }
    const known = loading.get(file);
    if (known) {
        return known;
    }
    let waiting = true;
    const promise = new Promise((resolve, reject) => {
        let script = null;
        let timer = null;
        // settle ends the attempt, once: with the library, or without (the file did not come,
        // came too late, is not the library, or could not even be asked for)
        const settle = (library) => {
            if (!waiting) {
                return;
            }
            waiting = false;
            clearTimeout(timer);
            loading.delete(file);
            if (library === undefined) {
                script?.remove();
                reject(new Error(`could not load ${VENDOR_DIR}${file}`));
            } else {
                resolve(library);
            }
        };
        try {
            script = document.createElement("script");
            script.addEventListener("load", () => settle(onPage(globalName)));
            script.addEventListener("error", () => settle(undefined));
            timer = setTimeout(() => settle(undefined), VENDOR_LOAD_TIMEOUT_MS);
            script.src = `${VENDOR_DIR}${file}`;
            document.head.append(script);
        } catch {
            settle(undefined);
        }
    });
    // (an attempt that ended at once is already forgotten, and stays so)
    if (waiting) {
        loading.set(file, promise);
    }
    return promise;
}
