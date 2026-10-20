"""
Aura Skincare - the AI's toolbox.

The LLM cannot read our Python memory directly. To let it look up an order we
must (a) describe the tool to the model and (b) give it a real function to run.

"""

from .orders import find_order


def get_order_details(order_id):
    """
    function that runs when the AI calls the tool.

    Returns a dict. On success we include the order fields plus "found": True.
    If the ID does not exist we return "found": False, which lets the AI reply
    politely ("I couldn't find that order, could you check the ID?").
    """
    order = find_order(order_id)
    if order is None:
        return {"found": False, "order_id": order_id}
    return {"found": True, **order}


# The registry: each entry pairs the runnable function with the JSON schema
# that tells the LLM when and how to use it.
TOOLS = {
    "get_order_details": {
        "function": get_order_details,
        "schema": {
            "type": "function",
            "function": {
                "name": "get_order_details",
                "description": (
                    "Look up an order by its order ID to get the customer "
                    "name, product, amount, current status, courier, tracking "
                    "number and expected delivery. Use this whenever the "
                    "customer asks about a specific order."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "order_id": {
                            "type": "string",
                            "description": (
                                "The order ID, e.g. 'ORD-101'. Accept the ID "
                                "exactly as the customer said it."
                            ),
                        }
                    },
                    "required": ["order_id"],
                },
            },
        },
    },
}


def run_tool(name, arguments):
    """
    Generic dispatcher: run whichever tool the AI asked for.

    The LLM replies with a tool *name* and *arguments* (a dict parsed from
    JSON). We look the name up in TOOLS and call its function with **arguments.
    This one function replaces an if/elif chain, so new tools need no changes
    here.
    """
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"Unknown tool: {name}"}
    return tool["function"](**arguments)
