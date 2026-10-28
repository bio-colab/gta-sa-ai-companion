from setuptools import setup, find_namespace_packages

setup(
    name="cli-anything-gta",
    version="1.0.0",
    description="Agent-native stateful CLI harness for GTA San Andreas AI Companion",
    long_description=open("GTA_COMPANION.md", encoding="utf-8").read() if True else "",
    long_description_content_type="text/markdown",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    package_data={
        "cli_anything.gta_companion": ["skills/*.md"],
    },
    include_package_data=True,
    install_requires=[
        "click>=8.0.0",
        "prompt-toolkit>=3.0.0",
    ],
    entry_points={
        "console_scripts": [
            "cli-anything-gta=cli_anything.gta_companion.gta_cli:main",
        ],
    },
    python_requires=">=3.10",
)
