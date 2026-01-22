// @ts-check

/** Script run on browser side for initializing the page */
export const pageScript = () => {
    var interval = 0;

    /** @type HTMLImageElement[] */
    var imageCollection = [];

    document.body.insertAdjacentHTML("beforeend", `<div id="imageMarkers" style="position: absolute; top: 0px; left: 0px;"></div>`);
    const markers = document.getElementById("imageMarkers");

    /** Window ref */
    const w = /** @type any */(window);
    if (!w.addMarker) {
        /**
         * @param {string} url
         * @param {number} pdist
         * @param {string} type
         * @param {string} size
         */
        w.addMarker = (url, pdist, type, size) => {
            imageCollection = Array.from(document.querySelectorAll("img"));
            if (markers) {
                const img = /** @type HTMLImageElement */ (document.querySelector(`img[src="${url}"]`));

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
<div class="marker-button" style="background-color: ${color};" onclick="saveImage('${url}')">${pdist}</div>`;
                    // @ts-ignore
                    img.marker = marker;
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

        // Regularly update marker positions so they align with the images
        if (!interval) {
            interval = window.setInterval(() => {
                layoutMarkers();
            }, 1000);
        }
    }
}