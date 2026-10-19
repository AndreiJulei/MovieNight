# Original learning notes

These notes record the original learning questions. Follow the
[current workflow](docs/movienight-workflow.md) for document layout and execution;
its feature-size branches replace the rough sequencing and context estimates below.

## What does the workflow look like

Constitution:
    1. Mission
    2. Tech Stack
    3. Roadmap


1. mission.md
The why, the projects vision, audiences, scope 

2. tech-stack.md
The engeenering team: development and deployment technologies

3. roadmap.md
Living document, sequence of phases, each implemented with their own feature spec process. - should be in small steps easier to review
 

After the constitution, each feature follows specification -> implementation ->
validation. The current convention keeps these in one feature record; add a
separate plan only when needed. See [the workflow](docs/movienight-workflow.md).

In between features its time for the REPLANNING PHASE 
Revise the constitution -> Update kthe roadmap -> and even imporve the process itself

course link: see transcript:
https://www.youtube.com/watch?v=hy8UstR2NEg


each feature should start in the right conditions:
1. Do i have unfinished work?
2. Did i merge the last feature branch to main?
3. Is the next roadmap item the right thing to do?
4. Did i clear the agents context to make sure the specs capture the intent instead of memory snapshots and to let it focus the context budget on the next work


I want to learn how to use spec-driven development. 
so far i've understood the process look in file spec.md to see
First task is to build the constitution, i will type out the overview of the app (the mission) in context.md, feel free to change it anyhow for subagents clear context, and ask me as many questions as necessary (do i have to activate some sort of ask user input so i can anwer witthout you stopping your workflow?). Help me build the constitution by following the spec.md, and going through the code itself.

Use skill mattpocock from /.agents/skills
setup is:
1. /grill-with-docs -> (if its a big implementation) 2 and 3 if not jump to 4
2. /to-spec
3. /to-tickets
4. /implement  | /implement @tickts (for bigger tasks again)
5. /code-review

- usually clear context inbetween tickets (roughtly 140k tokens)
- subagents vs main agent - agents are bad at reviewing just written code so using subagents have a clear context and can write code better 

also can you write two separate .md files where you explain in more detail the way spec driven works and how you would implement it, what is /mcp skills is, how skills for agents work, what are webhooks and how to use subagents.

dont look in mainPageLogo folder its not important right now 