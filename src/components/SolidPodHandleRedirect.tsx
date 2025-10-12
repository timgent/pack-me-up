import { getDefaultSession, handleIncomingRedirect, Session } from "@inrupt/solid-client-authn-browser";
import { useEffect } from "react"
import { SCHEMA_INRUPT, RDF, AS } from "@inrupt/vocab-common-rdf";
import {
    addStringNoLocale,
    addUrl,
    createSolidDataset,
    createThing,
    getPodUrlAll,
    getSolidDataset,
    getThingAll,
    saveSolidDatasetAt,
    setThing,
    SolidDataset,
} from "@inrupt/solid-client";
import { useSolidPod } from "./SolidPodContext";

export const SolidPodHandleRedirect = () => {
    useEffect(() => {
        console.log("Handling redirect")
        const handleRedirect = async () => {
            const result = await handleIncomingRedirect({ restorePreviousSession: true });
            console.log("RESULT: ", JSON.stringify(result))
            const session = getDefaultSession();
            console.log("isLoggedIn", session.info.isLoggedIn);
            console.log("webId", session.info.webId);
            if (session.info.isLoggedIn && session.info.webId) {
                console.log("Logged in - webId is: ", session.info.webId)
                const availablePods = await getPodUrlAll(session.info.webId, { fetch: session.fetch })
                const chosenPod = availablePods[0]
                const datasetUrl = `${chosenPod}pack-me-up`;
                console.log(`chosen pod is: ${chosenPod}`)
                let solidDataset: SolidDataset
                try {
                    console.log("Getting solid dataset...")
                    solidDataset = await getSolidDataset(datasetUrl, { fetch: session.fetch })
                } catch (error) {
                    if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === "number" && error.statusCode === 404) {
                        // if not found, create a new SolidDataset (i.e., the reading list)
                        console.log("Dataset not found, creating...")
                        solidDataset = createSolidDataset();
                    } else {
                        console.error(error);
                        return; // Exit early if there's an error
                    }
                }
                let item = createThing({ name: "Moopsie" });
                item = addUrl(item, RDF.type, AS.Article);
                item = addStringNoLocale(item, SCHEMA_INRUPT.name, "It's a Moopsie run for your lives!");
                solidDataset = setThing(solidDataset, item);
                console.log(`updated dataset is: `)
                const savedDataset = await saveSolidDatasetAt(
                    datasetUrl,
                    solidDataset,
                    { fetch: session.fetch }
                );
                console.log("Saved a thing!")
                // const readingListUrl = `${chosenPod}getting-started/readingList/myList`;
                // const myReadingList = await getSolidDataset(readingListUrl, { fetch: fetch });
                // let items = getThingAll(myReadingList);
                // const myPackingDataset = await getSolidDataset(`${chosenPod}pack-me-up`);
                // const items = getThingAll(myPackingDataset);
                // console.log(`items in pod are: ${items}`)
            }

        }
        handleRedirect()
    }, [])

    return (
        <h1>Handling redirect...</h1>
    )
}

async function getOrCreateDataset(session: Session, url: string): Promise<SolidDataset> {
    let solidDataset: SolidDataset
    try {
        solidDataset = await getSolidDataset(url, { fetch: session.fetch })
    } catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === "number" && error.statusCode === 404) {
            // if not found, create a new SolidDataset (i.e., the reading list)
            solidDataset = createSolidDataset();
        } else {
            console.error(error);
            throw error; // Re-throw if it's not a 404
        }
    }
    return solidDataset
}

