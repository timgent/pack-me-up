import { saveFileInContainer } from '@inrupt/solid-client'
import { file } from 'zod'
import { Button } from '../components/Button'
import { useSolidPod } from '../components/SolidPodContext';

export function MoopPage() {
  const { session, isLoggedIn } = useSolidPod();

  const handleClick = async () => {
    console.log("CLICKED ME")
    const filename = "test.json"
    const file = new File(["QUACK QUACK"], filename, { type: 'application/json' })
    await saveFileInContainer(
      "https://pack-me-up-test.solidcommunity.net/pack-me-up/packing-lists/",
      // "http://test.localhost:4000/pack-me-up/packing-lists/",
      file,
      {
        fetch: session!.fetch,
        slug: filename
      }
    )
  }

  return (
    <Button onClick={handleClick}>CLICK ME</Button>
  )
}
