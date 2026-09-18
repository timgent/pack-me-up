import { useSolidProfile } from '../hooks/useSolidProfile'
import { friendlyWebIdName } from '../services/solidPod'
import type { AppSession } from '../types/AppSession'

/**
 * One person in a list of who has access, named rather than spelled out.
 *
 * A column of raw WebIDs is unreadable in the one moment it has a job to do —
 * checking that the person you just shared with is the person you meant. Their
 * own profile card usually has a name and a face; when it does not, the address
 * still yields something better than the whole string.
 *
 * The address stays on the line below all the same. It is what they would have
 * to compare against if something looked wrong, and it is the thing the revoke
 * button acts on.
 */
export function CollaboratorIdentity({ webId, session }: { webId: string; session: AppSession | null | undefined }) {
    const profile = useSolidProfile(webId, session)

    return (
        <div className="flex items-center gap-2 min-w-0 flex-1">
            {profile.photo && (
                <img src={profile.photo} alt="" aria-hidden="true" className="h-7 w-7 rounded-full object-cover shrink-0" />
            )}
            <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {profile.name ?? friendlyWebIdName(webId)}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate" title={webId}>{webId}</p>
            </div>
        </div>
    )
}
