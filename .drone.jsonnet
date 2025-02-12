
local vars = std.parseYaml(importstr ".drone.jsonnet.yml");
local template = import "/home/king/temp/byterum/configuration/developer/ci/drone/templates/default.jsonnet";
template.Render{ pipelines: vars.pipelines }.data
