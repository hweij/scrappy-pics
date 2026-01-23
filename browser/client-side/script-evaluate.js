// @ts-check

export function pageScript() {
    var interval = 0;

    /** @type HTMLImageElement[] */
    var imageCollection = [];

    document.body.insertAdjacentHTML("beforeend", `<div id="imageMarkers" style="position: absolute; top: 0px; left: 0px;"></div>`);
    const markers = document.getElementById("imageMarkers");

    // Regularly update marker positions so they align with the images
    if (!interval) {
        interval = window.setInterval(() => {
            layoutMarkers();
        }, 1000);
    }

    /**
     * @param {string} url
     * @param {number} pdist
     * @param {string} type
     * @param {string} size
     */
    // @ts-ignore
    window.addMarker = (url, pdist, type, size) => {
        console.log("ADD MARKER");
        imageCollection = Array.from(document.querySelectorAll("img"));
        if (markers) {
            // TODO: do not query all images for each marker.
            const images = Array.from(document.querySelectorAll("img"));
            // Find image with matching src by inspecting currentSrc. This refers to the ACTUAL url loaded.
            const img = images.find(img => img.currentSrc === url);

            if (img) {
                // @ts-ignore
                if (img.marker) {
                    // @ts-ignore
                    img.marker.remove();
                    // @ts-ignore
                    img.marker = undefined;
                }
                const rect = img.getBoundingClientRect();
                const marker = document.createElement("div");
                marker.className = "marker";
                marker.style.cssText = `left: ${rect.left}px; top: ${rect.top}px;`;
                const color = (pdist < 11) ? ((pdist < 5) ? "green" : "blue") : "red";
                markers.appendChild(marker);

                marker.innerHTML = `
<div class="marker-info">${type} ${size} ${img.naturalWidth}x${img.naturalHeight}</div>
<div class="marker-button" style="background-color: ${color};">${pdist}</div>`;
                const button = marker.querySelector(".marker-button");
                if (button) {
                    // @ts-ignore
                    marker.onclick = () => window.saveImage(url);
                }
                // @ts-ignore
                img.marker = marker;
            }
            else {
                console.log(`Could not find image on page with URL ${url}`);
            }
        }
    }

    function layoutMarkers() {
        for (const img of imageCollection) {
            // @ts-ignore
            const marker = /** HTMLElement */(img.marker);
            if (marker) {
                const rect = img.getBoundingClientRect();
                marker.style.left = `${rect.left + window.scrollX}px`;
                marker.style.top = `${rect.top + window.scrollY}px`;
            }
        }
    }
}
