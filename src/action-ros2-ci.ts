import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as io from "@actions/io";

async function run() {
  try {
    const packageName = core.getInput("package-name");
    const ros2WorkspaceDir = "/opt/ros2_ws";
    await exec.exec("rosdep", ["update"]);

    // Checkout ROS 2 from source and install ROS 2 system dependencies
    await io.mkdirP(ros2WorkspaceDir + "/src");

    const options = {
      cwd: ros2WorkspaceDir
    };
    await exec.exec(
        "bash",
        ["-c",
        "curl https://raw.githubusercontent.com/ros2/ros2/master/ros2.repos | vcs import src/"],
        options);

    // The repo file for the repository needs to be generated on-the-fly to
    // incorporate the custom repository URL and branch name, when a PR is
    // being built.
    const repo = github.context.repo;
    await exec.exec(
        "bash",
        ["-c", `vcs import src/ << EOF
repositories:
  ${packageName}:
    type: git
    url: "https://github.com/${repo["owner"]}/${repo["repo"]}.git"
    version: "${github.context.sha}"
EOF`], options);

    // For "latest" builds, rosdep often misses some keys, adding "|| true", to
    // ignore those failures, as it is often non-critical.
    await exec.exec(
        "bash",
        ["-c", "DEBIAN_FRONTEND=noninteractive RTI_NC_LICENSE_ACCEPTED=yes rosdep install -r --from-paths src --ignore-src --rosdistro eloquent -y || true"],
        options);

    await exec.exec(
        "colcon",
        ["build", "--event-handlers", "console_cohesion+", "--packages-up-to",
        packageName, "--symlink-install"], options);
    await exec.exec(
        "colcon",
        ["test", "--event-handlers", "console_cohesion+", "--packages-select",
        packageName, "--return-code-on-test-failure"], options);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();