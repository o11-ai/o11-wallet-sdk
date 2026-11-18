---
summary: How many people at each company get messages, in what order, and when the next ones start.
used_by: [outbound, follow-ups]
changed: 0.12.0
change: New step. Ostack works a company two people at a time, best fit first, and starts the next person on the next outbound run once someone's follow-ups are used up, up to 20 people per company. A reply from anyone there pauses the rest.
---
A company is worked a few people at a time, not one person and done. Everything below is the default. The user's files can change any part of it, in their own words: how many at once, the most per company, the order, who to skip, a wait between people, rules by company size or audience, and how later messages are written. Their files win.

## The defaults
- **At once:** at most `per_company` people at one company are being contacted at the same time (2 unless the settings say otherwise).
- **Most per company:** 20 people. After that the company is done.
- **Order:** best fit first. Rank people by how close their title is to the buyer the qualify file describes; where it lists titles, in that order. Ties go to the more senior person.
- **No wait:** a person stops counting toward "at once" as soon as their last follow-up has gone out without a reply (or follow-ups are off for their audience and their first message went out). The next person starts on the next outbound run. The follow-ups run never starts new people.

## Who counts as open
A person is open while their status is `sending`, `scheduled` or `drafted`, or `contacted` with a follow-up still to come. Everyone else at the company is either waiting their turn (`queued`) or finished.

## The company's record
Keep these on the company, in the company list the tam step describes (add the company there when its first person qualifies, if it came from somewhere else):
- `o11_company_status`: `working`, `paused` (a conversation is open there), `won`, `done` (the most per company is reached or nobody is left), or `skip` (with the reason in `note`).
- `o11_people_tried`: how many people there have had a first message.
- the people at the company, linked the way the tool links people to companies (a CRM's association, a linked record, or the same `domain`).

## Ranking once
When find takes a company, search for the people there who fit, once, ranked as above. Add the first `per_company` of them as `new`, as usual. Save the rest of the list as `queued`, best first, with `o11_rank` (1 is first), name, title, LinkedIn URL and source. Do not look up emails for queued people yet: that is done when their turn comes, so nothing is paid for people who are never reached. Up to the most per company in total is enough.

## Starting the next person
On each outbound run, before taking new companies, check every `working` company you own:
1. Count the open people. If fewer than `per_company`, and `o11_people_tried` is under the most per company, it has a free place.
2. Take the next `queued` person by rank. Check they are still at the company and in that role (`o11.linkedin.user.profile`), and find their email the way find does. If either fails, mark them `disqualified` with the reason and take the next one.
3. Set them `new`. They go through qualify (the company verdict carries over; only the person is checked), research, write and send like anyone else.
4. With nobody queued, search the company again once for people not yet in the record tool. Still nobody: set the company `done`.

These count toward the day's limits like any first message.

## When something happens at the company
- **A real reply from anyone there** (`replied`, `needs you`): set the company `paused`. Start nobody new and hold the other people's follow-ups (move their next follow-up date, never send) until that conversation ends. If it ends without a meeting, set the company back to `working` and carry on.
- **A meeting:** set the company `won`. Nobody else there gets a cold message.
- **"Not now" with a date:** defer every open and queued person there until that date.
- **The company is not interested** ("we're all set", "we already use X", said for the company): set it `skip` with the reason. Nobody else there gets a message.
- **One person opts out:** only that person. The others carry on.
- **A referral:** the person named goes first, ahead of the queue. Their message is not cold (the reply step).
- **A bounce, wrong person, or someone who left:** they stop counting as open right away, so the next person starts on the next run.
- **A do-not-contact domain:** set the company `skip`.

## Writing to later people
Each person gets their own first message in a new thread, written from their own research. Out of the box it does not mention their colleagues. The user's files can change that (for example, "mention I wrote to their CEO last month").
