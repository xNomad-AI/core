
### Dev

onlineViewer: [Mermaid Live Editor](https://mermaid-js.github.io/mermaid-live-editor/view#pako:eJyFkk1PAyEQhv8K4Wgkq2l68eDJo170ZrhMl9mykQXCR+O63f/uIG1aU7dygHnfeZiBwMRbp5A/ML4N4DV7fpWW0VC4Y0I87gN2sdEIKjZkoXF+z3zemD5qcYX0xo3NzSVafFFwdlm4MscdV6HFQrXvf5XOqZg39eZLvZah8zLHcTjZn6ZoNbYfpxRaJW2VFPJbxgcMA/SqPMdUEpInjQNKMiRX2EE2SXJp5wJDTu5ttC0lU8hITnB5q0l2YGLR2StI+NQDHX44YR7su3O/DRIT/6T5jvRI62q9nin8quA9haj65MLL4bv8fJv5G0OxtMQ=)

```txt
graph LR
    dev -->|refs/heads/develop| publish-
    dev -->|refs/heads/deploy/*| publish-
    deploy- --> refs/heads/develop
    publish- --> refs/heads/develop
    deploy- --> refs/heads/deploy/*
    publish- --> refs/heads/deploy/*
    subgraph refs/heads/develop
        subgraph refs/heads/deploy/*
            deploy-
            deploy--check
        end

    end
```

### Prod

onlineViewer: [Mermaid Live Editor](https://mermaid-js.github.io/mermaid-live-editor/view#pako:eJyFkbtuwzAMRX9F4FwhLYosGTJlbJdmK7QwFh0ZtR7QA6jr+N9Dxw7SwjCqQeLlPSApqYfKa4KdgHPEYMTbh3KCVyintklGCin3l0h12hhCnTYWU6Z4EZpC6zs5wbP4h5WVoeprLh+9XsPvrRe1xQJezrrGpHKaLrji/2q1SNwHnwxyGp4EWIoWGz2+XD8aCrIhS4oTCjTVWNqsQLlhhLFkf+xcxWaOhTgTfTkbljW2adQlaMx0aJCntA8soPv0/m+CRQ/fvD+z7vh83W4HDn8m8IVD0k328X3+2dsPD1dH5Z3T)

```txt
graph LR
    publish- -->|refs/heads/master| deploy-
    deploy- -->|refs/heads/master| deploy--check
    prod -->|refs/heads/master| publish-
    deploy- --> refs/heads/master
    publish- --> refs/heads/master
    subgraph refs/heads/master
        deploy-
        deploy--check

    end
```
