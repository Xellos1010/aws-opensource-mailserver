Skip to main content

Cursor - Community Forum
Cursor prompt engineering best practices
Discussions

Log In

​
📅
Cursor Bolivia Workshop
Starts in 02:15:20
Cursor Meetup Firenze
Starts in 3d 23:15:20
Cursor Meetup Kosovo
Starts in 4d 22:45:20
See All Events
→
Cursor prompt engineering best practices
Discussions

8.6k
views

8
likes

2
links





Nov 2023
 
Back
Jan 5

raw.works

1
Nov 2023
most of the time cursor does a pretty good job of understanding the context and content of the different embedded references, at least with gpt-4. the purpose of this post is to unearth best practices for prompt engineering that are specific to cursor.

for example, let’s say that i have documentation, a style guide, and an example. what are the best practices for labeling those @ differently so that the llm understands the appropriate context? i’ve been doing something like this:

using the style guide @style-guide, and following the example @example, write a @Hugo layout template that does …

any thoughts on this approach? (as additional nuance, this might return very different results with or without the “full codebase context” (cmd + return))

any cursor-specific prompting tricks that others are willing to share?

(now is the time for the grimoires)



8.6k
views

8
likes

2
links






nishant
Nov 2023
This is not a prompt guide as such, but I wanted to understand the changes that are being done to a particular Object so I saved the log of it and passed it as file and asked gpt-4 to give me the dummy value of this object considering this as the starting point. This helped me better understand the code


1 year later

g4d
Nov 2024
@raw.works After a year now, I’m wondering what you’ve learned, if anything, to improve your prompting.



raw.works
Nov 2024
success with cursor is all about context management.

“@codebase” is pretty risky. your basically admitting that you have no idea what is important for the AI to pay attention to, so you’re rolling the dice that the cursor reranker is going to get it right for you. this could be ok if know what to search for, like the name of a function, but i try not to use @codebase without also adding some specific files .

so if you can do things like “this is the backend @/backend.py, this is the frontend @/frontend.js, now go do ____” - you’re going to be way better off than just “@codebase, go do ____”.

also - for frameworks that aren’t likely to have a lot of examples in the training (ie, they are new or rare) - then i would recommend using cursor to ingest the docs and come up with advice, which you then put in .cursorrules

add the new docs as custom doc
tell the AI to generate the key things to remember about this framework.
then tell it to write those to .cursorrules voila. AI teaching AI. (learned the hard way after constantly reminding sonnet to re-read the svelte 5 docs)
CleanShot 2024-11-20 at 14.11.24@2x
CleanShot 2024-11-20 at 14.11.24@2x
1236×150 21.4 KB

CleanShot 2024-11-20 at 14.12.07@2x
CleanShot 2024-11-20 at 14.12.07@2x
1218×1692 223 KB
see my tweet with this advice: x.com



g4d
Nov 2024
tell the AI to generate the key things to remember about this framework.
then tell it to write those to .cursorrules
Ah, I have been just @ mentioning the docs every time, but I like this approach. Will give it a try.
Thanks for the detailed response, very helpful.


1 month later

Reply

Related topics
Topic list, column headers with buttons are sortable.
Topic		Replies	Views	Activity
Cursor for complex projects
Discussions
	38	5.3k	Feb 23
Mastering Long Codebases with Cursor, Gemini, and Claude: A Practical Guide
How To
	43	21.5k	Feb 28
An Idiot’s Guide To Bigger Projects
How To
	65	24.9k	Mar 26
This repo changed how I use Cursor AI
How To
	4	899	Mar 31
How to use prompt in cursor?
How To
	2	5.6k	Jan 9
✨ Ask Anything

