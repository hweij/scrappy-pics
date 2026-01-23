// @ts-check

export function pageScript() {
    var interval = 0;

    /** @type HTMLImageElement[] */
    var imageCollection = [];

    document.body.insertAdjacentHTML("beforeend", `<div id="imageMarkers" style="position: absolute; top: 0px; left: 0px;"></div>`);
    const divMarkers = document.getElementById("imageMarkers");

    // Regularly update marker positions so they align with the images
    if (!interval) {
        interval = window.setInterval(() => {
            layoutMarkers();
        }, 1000);
    }

    /**
     *
     * @param {{url: string, pdist: number, type: string, size: number }[]} mInfoList
     */
    //@ts-ignore
    window.addMarkers = (mInfoList) => {
        console.log(`Adding ${mInfoList.length} markers`);
        imageCollection = Array.from(document.querySelectorAll("img"));
        for (const marker of mInfoList) {
            addMarker(marker);
        }
    }

    /**
     * @param {{url: string, pdist: number, type: string, size: number }} mInfo
     */
    function addMarker(mInfo) {
        if (divMarkers) {
            const img = imageCollection.find(img => img.currentSrc === mInfo.url);

            if (img) {
                // @ts-ignore
                if (img.marker) {
                    // @ts-ignore
                    img.marker.remove();
                    // @ts-ignore
                    img.marker = undefined;
                }
                const rect = img.getBoundingClientRect();
                const divMarker = document.createElement("div");
                divMarker.className = "marker";
                divMarker.style.cssText = `left: ${rect.left}px; top: ${rect.top}px;`;
                const color = (mInfo.pdist < 11) ? ((mInfo.pdist < 5) ? "green" : "blue") : "red";
                divMarkers.appendChild(divMarker);

                divMarker.innerHTML = `
<div class="marker-info">${mInfo.type} ${(mInfo.size / 1000).toFixed()}K ${img.naturalWidth}x${img.naturalHeight}</div>
<div class="marker-button" style="background-color: ${color};">${mInfo.pdist}</div>`;
                const button = divMarker.querySelector(".marker-button");
                if (button) {
                    // @ts-ignore
                    divMarker.onclick = () => window.saveImage(mInfo.url);
                }
                // @ts-ignore
                img.marker = divMarker;
            }
            else {
                console.log(`Could not find image on page with URL ${mInfo.url}`);
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
